'use client';

import React from 'react';

export default function BackgroundShader() {
  return (
    <div className="hero-photo-wrapper" aria-hidden="true">
      <style dangerouslySetInnerHTML={{ __html: BACKGROUND_SHADER_STYLES }} />
      <div className="floating-shade shade-1" />
      <div className="floating-shade shade-2" />
      <div className="floating-shade shade-3" />
      <video
        className="hero-video-invert"
        autoPlay
        muted
        loop
        playsInline
        disablePictureInPicture
      >
        <source
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260818_072341_50851634-bbc3-4c33-9acc-7647d4db44aa.mp4"
          type="video/mp4"
        />
      </video>
    </div>
  );
}

const BACKGROUND_SHADER_STYLES = `
.hero-photo-wrapper {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.hero-video-invert {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  filter: invert(1) hue-rotate(180deg) contrast(1.15) opacity(0.3);
  mix-blend-mode: multiply;
  pointer-events: none;
  transition: opacity 0.5s ease, filter 0.5s ease;
}

html.dark .hero-video-invert {
  filter: invert(0) hue-rotate(0deg) contrast(1.1) opacity(0.85) !important;
  mix-blend-mode: screen !important;
}

.floating-shade {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  opacity: 0.18;
  transition: opacity 0.5s ease, background 0.5s ease;
}

html.dark .floating-shade {
  opacity: 0.35 !important;
  filter: blur(90px) !important;
}

.shade-1 {
  width: 550px;
  height: 550px;
  background: radial-gradient(circle, #0F172A 0%, rgba(15, 23, 42, 0) 70%);
  top: -100px;
  left: 20%;
  animation: bg-float-1 38s ease-in-out infinite alternate;
}

.shade-2 {
  width: 480px;
  height: 480px;
  background: radial-gradient(circle, #334155 0%, rgba(51, 65, 85, 0) 70%);
  top: 35%;
  right: 15%;
  animation: bg-float-2 44s ease-in-out infinite alternate;
}

.shade-3 {
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, #020617 0%, rgba(2, 6, 23, 0) 70%);
  bottom: -150px;
  left: 30%;
  animation: bg-float-3 50s ease-in-out infinite alternate;
}

html.dark .shade-1 {
  background: radial-gradient(circle, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0) 70%) !important;
}

html.dark .shade-2 {
  background: radial-gradient(circle, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0) 70%) !important;
}

html.dark .shade-3 {
  background: radial-gradient(circle, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0) 70%) !important;
}

@keyframes bg-float-1 {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(60px, 80px) scale(1.12); }
}
@keyframes bg-float-2 {
  0% { transform: translate(0, 0) scale(1.05); }
  100% { transform: translate(-80px, -60px) scale(0.95); }
}
@keyframes bg-float-3 {
  0% { transform: translate(0, 0) scale(0.95); }
  100% { transform: translate(-50px, 70px) scale(1.08); }
}
`;
