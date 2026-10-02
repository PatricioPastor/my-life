"use client"

import { useSyncExternalStore } from "react"
import { FULL_VOLUME, rememberVolume, subscribeVolume, type VolumePref } from "./player-model"

const serverVolume = () => FULL_VOLUME

/**
 * The volume the visitor chose, which only the browser knows (it is kept in localStorage). The server and the first
 * hydration pass render full volume, so the markup matches; right after, the remembered volume takes over.
 */
export function useVolume(): VolumePref {
  return useSyncExternalStore(subscribeVolume, () => rememberVolume(), serverVolume)
}
