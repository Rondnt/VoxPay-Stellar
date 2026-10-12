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
    const mobile = window.matchMedia("(max-width: 767px)");
    const updateVideo = () => {
      video.poster = mobile.matches
        ? "/brand/v2/voxi-login-mobile-poster.png"
        : "/brand/v2/voxi-login-blue-poster.png";
      video.load();
      video.playbackRate = 1.25;
      void video.play().catch(() => {
        // Keep the static pose if the browser cannot play the animation.
      });
    };
    updateVideo();
    mobile.addEventListener("change", updateVideo);
    return () => {
      mobile.removeEventListener("change", updateVideo);
      video.pause();
    };
  }, []);

  return (
    <div className="auth-voxi-video" aria-hidden="true">
      <video
        ref={videoRef}
        poster="/brand/v2/voxi-login-blue-poster.png"
        width={512}
        height={512}
        preload="auto"
        autoPlay
        muted
        playsInline
        loop
        aria-hidden="true"
      >
        <source
          src="/brand/v2/voxi-login-mobile.mp4"
          media="(max-width: 767px)"
          type="video/mp4"
        />
        <source src="/brand/v2/voxi-login.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
