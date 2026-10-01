import { describe, expect, it } from "vitest"
import {
  approximateLocation,
  dominantColorOf,
  extractPhotoDetails,
  paletteOf,
  storedPaletteOf,
  parseExifDate,
  whitelistMetadata,
} from "./photo-details"

describe("parseExifDate", () => {
  it("reads the EXIF date format as UTC when there is no offset", () => {
    expect(parseExifDate("2024:03:12 14:05:09")).toEqual(new Date("2024-03-12T14:05:09.000Z"))
  })

  it("applies OffsetTimeOriginal when present", () => {
    expect(parseExifDate("2024:03:12 14:05:09", "+02:00")).toEqual(new Date("2024-03-12T12:05:09.000Z"))
    expect(parseExifDate("2024:03:12 14:05:09", "-03:00")).toEqual(new Date("2024-03-12T17:05:09.000Z"))
    expect(parseExifDate("2024:03:12 14:05:09", "Z")).toEqual(new Date("2024-03-12T14:05:09.000Z"))
    expect(parseExifDate("2024:03:12 23:30:00", "-05:30")).toEqual(new Date("2024-03-13T05:00:00.000Z"))
  })

  it("also reads ISO-like dates and ignores fractions of a second", () => {
    expect(parseExifDate("2024-03-12T14:05:09")).toEqual(new Date("2024-03-12T14:05:09.000Z"))
    expect(parseExifDate("2024:03:12 14:05:09.45", "+01:00")).toEqual(new Date("2024-03-12T13:05:09.000Z"))
  })

  it("ignores an offset it cannot read instead of inventing one", () => {
    expect(parseExifDate("2024:03:12 14:05:09", "nope")).toEqual(new Date("2024-03-12T14:05:09.000Z"))
    expect(parseExifDate("2024:03:12 14:05:09", "+25:00")).toEqual(new Date("2024-03-12T14:05:09.000Z"))
  })

  it.each([
    ["absent", undefined],
    ["null", null],
    ["not a string", 20240312],
    ["empty", ""],
    ["garbage", "yesterday"],
    ["all zeros (cameras with no clock)", "0000:00:00 00:00:00"],
    ["month 13", "2024:13:12 10:00:00"],
    ["a day that does not exist", "2024:02:30 10:00:00"],
    ["hour 25", "2024:03:12 25:00:00"],
    ["minute 61", "2024:03:12 10:61:00"],
    ["before 1900", "1850:03:12 10:00:00"],
    ["after 2100", "2101:03:12 10:00:00"],
  ])("is null when the date is %s", (_name, value) => {
    expect(parseExifDate(value)).toBeNull()
  })
})

const gps = (over: Record<string, unknown> = {}) => ({
  GPSLatitude: `40 deg 42' 46.08" N`,
  GPSLatitudeRef: "N",
  GPSLongitude: `74 deg 0' 21.6" W`,
  GPSLongitudeRef: "W",
  ...over,
})

describe("approximateLocation", () => {
  it("converts degrees, minutes and seconds with hemisphere refs, then rounds to 2 decimals", () => {
    // 40 + 42/60 + 46.08/3600 = 40.7128; 74 + 0/60 + 21.6/3600 = 74.006, west so negative.
    expect(approximateLocation(gps())).toEqual({ latitude: 40.71, longitude: -74.01 })
  })

  it("applies the south and west refs, in letters or words, in any case", () => {
    expect(
      approximateLocation({
        GPSLatitude: `33 deg 52' 7.68" S`,
        GPSLatitudeRef: "South",
        GPSLongitude: `151 deg 12' 25.2" E`,
        GPSLongitudeRef: "east",
      }),
    ).toEqual({ latitude: -33.87, longitude: 151.21 })
    expect(approximateLocation(gps({ GPSLatitudeRef: "s", GPSLongitudeRef: "W" }))).toEqual({
      latitude: -40.71,
      longitude: -74.01,
    })
  })

  it("reads comma-separated, rational and array forms of degrees, minutes and seconds", () => {
    expect(approximateLocation(gps({ GPSLatitude: "40, 42, 46.08", GPSLongitude: "74, 0, 21.6" }))).toEqual({
      latitude: 40.71,
      longitude: -74.01,
    })
    expect(
      approximateLocation(gps({ GPSLatitude: "40/1, 42/1, 4608/100", GPSLongitude: "74/1, 0/1, 216/10" })),
    ).toEqual({ latitude: 40.71, longitude: -74.01 })
    expect(approximateLocation(gps({ GPSLatitude: [40, 42, 46.08], GPSLongitude: [74, 0, 21.6] }))).toEqual({
      latitude: 40.71,
      longitude: -74.01,
    })
  })

  it("reads decimal degrees, signed or with a ref, without negating twice", () => {
    expect(approximateLocation({ GPSLatitude: -33.8688, GPSLongitude: "151.2093" })).toEqual({
      latitude: -33.87,
      longitude: 151.21,
    })
    expect(
      approximateLocation({ GPSLatitude: "33.8688", GPSLatitudeRef: "S", GPSLongitude: -70.5, GPSLongitudeRef: "W" }),
    ).toEqual({ latitude: -33.87, longitude: -70.5 })
  })

  it("rounds half values up in magnitude, not by binary accident", () => {
    expect(approximateLocation({ GPSLatitude: "12.345", GPSLongitude: "1.005" })).toEqual({
      latitude: 12.35,
      longitude: 1.01,
    })
    expect(approximateLocation({ GPSLatitude: "-12.345", GPSLongitude: "-1.005" })).toEqual({
      latitude: -12.35,
      longitude: -1.01,
    })
  })

  it("never returns more than 2 decimals, so the exact position is not recoverable", () => {
    const location = approximateLocation({ GPSLatitude: "40.712812345", GPSLongitude: "-74.006009876" })
    expect(location).toEqual({ latitude: 40.71, longitude: -74.01 })
    for (const value of [location!.latitude, location!.longitude]) {
      expect(Math.round(value * 100) / 100).toBe(value)
    }
  })

  it("never returns negative zero", () => {
    const location = approximateLocation({ GPSLatitude: "-0.001", GPSLongitude: "10" })
    expect(Object.is(location!.latitude, 0)).toBe(true)
  })

  it.each([
    ["latitude above 90", gps({ GPSLatitude: "91", GPSLatitudeRef: "N" })],
    ["latitude below -90", gps({ GPSLatitude: "-90.5" })],
    ["longitude above 180", gps({ GPSLongitude: "181", GPSLongitudeRef: "E" })],
    ["minutes of 60 or more", gps({ GPSLatitude: `40 deg 60' 0" N` })],
    ["seconds of 60 or more", gps({ GPSLatitude: `40 deg 10' 60" N` })],
    ["negative components", gps({ GPSLatitude: "40, -2, 3" })],
    ["a DMS value with no ref", gps({ GPSLatitudeRef: undefined, GPSLatitude: "40, 42, 46" })],
    ["a ref that is not a hemisphere", gps({ GPSLatitudeRef: "X" })],
    ["a ref of the other axis", gps({ GPSLatitudeRef: "E" })],
    ["not-a-number values", gps({ GPSLatitude: "NaN" })],
    ["infinite values", gps({ GPSLongitude: Infinity })],
    ["a non-scalar value", gps({ GPSLongitude: { deg: 74 } })],
    ["empty values", gps({ GPSLatitude: "" })],
    ["a missing longitude", gps({ GPSLongitude: undefined })],
    ["a missing latitude", gps({ GPSLatitude: undefined })],
  ])("is null for %s", (_name, raw) => {
    expect(approximateLocation(raw)).toBeNull()
  })

  it("is null for the 0,0 no-fix position", () => {
    expect(approximateLocation({ GPSLatitude: "0", GPSLongitude: "0" })).toBeNull()
    expect(
      approximateLocation({
        GPSLatitude: "0, 0, 0",
        GPSLatitudeRef: "N",
        GPSLongitude: "0, 0, 0",
        GPSLongitudeRef: "E",
      }),
    ).toBeNull()
  })

  it("is null when there is no metadata at all", () => {
    expect(approximateLocation({})).toBeNull()
  })
})

describe("whitelistMetadata", () => {
  it("keeps only the useful, non-identifying fields", () => {
    expect(
      whitelistMetadata({
        Make: "Apple",
        Model: "iPhone 15",
        LensModel: "iPhone 15 back camera 6.86mm f/1.78",
        ISO: "125",
        FNumber: "1.78",
        ExposureTime: "1/320",
        FocalLength: "6.86",
        Orientation: "Horizontal (normal)",
        DateTimeOriginal: "2024:03:12 14:05:09",
        OffsetTimeOriginal: "+02:00",
        ExifImageWidth: "4032",
        ExifImageHeight: "3024",
        Colorspace: "RGB",
      }),
    ).toEqual({
      Make: "Apple",
      Model: "iPhone 15",
      LensModel: "iPhone 15 back camera 6.86mm f/1.78",
      ISO: "125",
      FNumber: "1.78",
      ExposureTime: "1/320",
      FocalLength: "6.86",
      Orientation: "Horizontal (normal)",
      DateTimeOriginal: "2024:03:12 14:05:09",
      OffsetTimeOriginal: "+02:00",
      ExifImageWidth: "4032",
      ExifImageHeight: "3024",
    })
  })

  it("drops every GPS field, serial number and owner or author name", () => {
    const raw = {
      Make: "Canon",
      GPSLatitude: "40.7",
      GPSLongitude: "-74.0",
      GPSLatitudeRef: "N",
      GPSLongitudeRef: "W",
      GPSAltitude: "10",
      GPSPosition: "40.7, -74.0",
      GPSDateStamp: "2024:03:12",
      GPSImgDirection: "90",
      SerialNumber: "123",
      BodySerialNumber: "456",
      LensSerialNumber: "789",
      InternalSerialNumber: "000",
      CameraOwnerName: "Ana Pérez",
      OwnerName: "Ana Pérez",
      Artist: "Ana Pérez",
      Copyright: "Ana",
      Creator: "Ana",
      "dc:creator": "Ana",
      XPAuthor: "Ana",
      ImageUniqueID: "abc",
      UserComment: "casa de Ana",
      Software: "Photoshop",
      HostComputer: "Ana's laptop",
      DeviceSettingDescription: "x",
    }
    expect(whitelistMetadata(raw)).toEqual({ Make: "Canon" })
    const json = JSON.stringify(whitelistMetadata(raw))
    expect(json).not.toMatch(/GPS|Serial|Owner|Artist|Copyright|Creator|Author|Ana/)
  })

  it("keeps only plain, short values and strips control characters", () => {
    expect(
      whitelistMetadata({
        Make: "Sony\u0000\n",
        Model: { nested: "no" },
        LensModel: ["a", "b"],
        ISO: 200,
        FNumber: Number.NaN,
        ExposureTime: "x".repeat(200),
        FocalLength: "",
        Orientation: null,
      }),
    ).toEqual({ Make: "Sony", ISO: 200 })
  })

  it("is empty for a missing or non-object input", () => {
    expect(whitelistMetadata(undefined)).toEqual({})
    expect(whitelistMetadata(null)).toEqual({})
    expect(whitelistMetadata("Make")).toEqual({})
  })
})

describe("colors", () => {
  const colors = [
    ["#152E02", 7.9],
    ["#2E4F06", 6.3],
    ["#3A6604", 5.6],
    ["#EEF2F3", 5.2],
    ["#598504", 4.6],
    ["#0D1903", 4.6],
  ]

  it("takes the most prominent color as a lowercase #rrggbb", () => {
    expect(dominantColorOf(colors)).toBe("#152e02")
  })

  it("does not depend on the order Cloudinary lists them in", () => {
    expect(dominantColorOf([...colors].reverse())).toBe("#152e02")
  })

  it("keeps the top five with their shares, as lowercase hex", () => {
    expect(paletteOf(colors)).toEqual([
      { color: "#152e02", share: 7.9 },
      { color: "#2e4f06", share: 6.3 },
      { color: "#3a6604", share: 5.6 },
      { color: "#eef2f3", share: 5.2 },
      { color: "#598504", share: 4.6 },
    ])
  })

  it("skips malformed entries", () => {
    const messy = [
      ["red", 50],
      ["#12", 40],
      ["#GGGGGG", 30],
      [null, 20],
      ["#aabbcc", Number.NaN],
      ["#aabbcc", -1],
      "#aabbcc",
      ["#0A0B0C", 9],
    ]
    expect(paletteOf(messy)).toEqual([{ color: "#0a0b0c", share: 9 }])
  })

  it("is null and empty when there are no usable colors", () => {
    expect(dominantColorOf(undefined)).toBeNull()
    expect(dominantColorOf([])).toBeNull()
    expect(dominantColorOf("#ffffff")).toBeNull()
    expect(paletteOf(undefined)).toEqual([])
    expect(paletteOf({})).toEqual([])
  })
})

describe("extractPhotoDetails", () => {
  const asset = {
    format: "JPG",
    bytes: 2_000_000,
    imageMetadata: {
      Make: "Apple",
      DateTimeOriginal: "2024:03:12 14:05:09",
      OffsetTimeOriginal: "+02:00",
      SerialNumber: "SECRET",
      CameraOwnerName: "Ana",
      ...gps(),
    },
    colors: [
      ["#112233", 40],
      ["#ffffff", 10],
    ],
  }

  it("maps Cloudinary's answer to the typed domain value", () => {
    expect(extractPhotoDetails(asset, { shareLocation: false })).toEqual({
      kind: "image",
      format: "jpg",
      bytes: 2_000_000,
      takenAt: new Date("2024-03-12T12:05:09.000Z"),
      dominantColor: "#112233",
      palette: [
        { color: "#112233", share: 40 },
        { color: "#ffffff", share: 10 },
      ],
      metadata: { Make: "Apple", DateTimeOriginal: "2024:03:12 14:05:09", OffsetTimeOriginal: "+02:00" },
      approxLatitude: null,
      approxLongitude: null,
      placeName: null,
      locationSource: null,
    })
  })

  it("stores the approximate location only when the visitor opted in", () => {
    expect(extractPhotoDetails(asset, { shareLocation: true })).toMatchObject({
      approxLatitude: 40.71,
      approxLongitude: -74.01,
      locationSource: "photo",
      placeName: null,
    })
    expect(extractPhotoDetails(asset, { shareLocation: false })).toMatchObject({
      approxLatitude: null,
      approxLongitude: null,
      locationSource: null,
    })
  })

  it("stores no location when the visitor opted in but the photo has no valid GPS", () => {
    const noGps = { ...asset, imageMetadata: { Make: "Apple" } }
    expect(extractPhotoDetails(noGps, { shareLocation: true })).toMatchObject({
      approxLatitude: null,
      approxLongitude: null,
    })
    const bad = { ...asset, imageMetadata: { ...gps({ GPSLatitude: "95" }) } }
    expect(extractPhotoDetails(bad, { shareLocation: true })).toMatchObject({
      approxLatitude: null,
      approxLongitude: null,
    })
  })

  it("never lets exact coordinates, GPS fields or secrets reach the result, with or without consent", () => {
    for (const shareLocation of [true, false]) {
      const json = JSON.stringify(extractPhotoDetails(asset, { shareLocation }))
      expect(json).not.toMatch(/GPS|42' 46|46\.08|21\.6|Serial|SECRET|Owner|Ana/)
    }
  })

  it("copes with a missing or odd metadata and colors answer", () => {
    expect(extractPhotoDetails({ format: "png", bytes: 10 }, { shareLocation: true })).toEqual({
      kind: "image",
      format: "png",
      bytes: 10,
      takenAt: null,
      dominantColor: null,
      palette: [],
      metadata: {},
      approxLatitude: null,
      approxLongitude: null,
      placeName: null,
      locationSource: null,
    })
  })

  it("is null for the taken date when DateTimeOriginal is unparseable", () => {
    const odd = { ...asset, imageMetadata: { DateTimeOriginal: "0000:00:00 00:00:00" } }
    expect(extractPhotoDetails(odd, { shareLocation: false }).takenAt).toBeNull()
  })
})

describe("storedPaletteOf", () => {
  it("reads back the stored objects and drops anything else", () => {
    expect(
      storedPaletteOf([{ color: "#112233", share: 40 }, { color: "bad", share: 1 }, "junk", null, { color: "#FFFFFF", share: 5 }]),
    ).toEqual([
      { color: "#112233", share: 40 },
      { color: "#ffffff", share: 5 },
    ])
    expect(storedPaletteOf(undefined)).toEqual([])
    expect(storedPaletteOf({})).toEqual([])
  })
})
