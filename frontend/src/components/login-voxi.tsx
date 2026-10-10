"use client";

import { useEffect, useRef } from "react";

export function LoginVoxi() {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.defaultPlaybackRate = 1.25;
    video.playbackRate = 1.25;
    video.muted = true;
    video.volume = 0;
    void video.play().catch(() => {
      // Keep the static pose if the browser cannot play the animation.
    });
    return () => video.pause();
  }, []);

  return (
    <div className="auth-voxi-video" aria-hidden="true">
      <video
        ref={videoRef}
        src="/brand/v2/voxi-login.mp4"
        poster="/brand/v2/voxi-login-blue-poster.png"
        width={512}
        height={512}
        preload="auto"
        autoPlay
        muted
        playsInline
        loop
        aria-hidden="true"
      />
    </div>
  );
}
