// The orb's portal, in milliseconds. The way in runs the tunnel for 1.7 s and lets it linger 1.3 s over the
// memories space while it fades. The way back runs at about half of that, tuned by eye: it opens over the
// memories, flies, and fades into the sky it arrives in.
export const ORB_WARP_MS = 1700
export const ORB_EXIT_MS = 1300

export const ORB_RETURN_MS = 850
export const ORB_RETURN_EXIT_MS = 550
/** The tunnel's fade-out over the sky; it ends before the layer is let go, so nothing pops. */
export const ORB_RETURN_FADE_MS = 500
/** Under reduced motion there is no tunnel: the memories simply fade out over the sky. */
export const ORB_RETURN_REDUCED_MS = 300
