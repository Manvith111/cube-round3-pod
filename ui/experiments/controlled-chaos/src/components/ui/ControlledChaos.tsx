"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { ArrowUpRight, Sparkles, Star, Zap, Circle, MoveRight, X, Minus, Plus } from "lucide-react";

if (typeof window !== "undefined") {
    gsap.registerPlugin(ScrollTrigger);
}

// --- GLOBAL STYLES & ASSETS ---
export function GlobalStyles() {
    return (
        <>
            <style jsx global>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&family=Permanent+Marker&display=swap');

      :root {
        --c-bg: #fffbf0; /* Cream Paper */
        --c-ink: #101010;
        --c-lime: #ccff00;
        --c-purple: #b084ff;
        --c-orange: #ff5e00;
      }

      body {
        background-color: var(--c-bg);
        color: var(--c-ink);
        font-family: 'Space Grotesk', sans-serif;
        overflow-x: hidden;
      }

      .font-marker {
        font-family: 'Permanent Marker', cursive;
      }

      /* NOISE OVERLAY */
      .noise {
        position: fixed; inset: 0; z-index: 9999; pointer-events: none; opacity: 0.04;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
      }

      /* SVG FILTERS FOR WOBBLE */
      .wobble-border {
        position: relative;
      }
      .wobble-border::before {
        content: ''; position: absolute; inset: -3px; 
        background: transparent; border: 3px solid var(--c-ink);
        z-index: -1; filter: url(#rough-edges);
        transition: all 0.3s ease;
      }
      .wobble-fill::before {
        background: var(--c-lime);
      }

      /* UTILITIES */
      .text-outline {
        -webkit-text-stroke: 2px var(--c-ink);
        color: transparent;
      }
    `}</style>

            {/* SVG Filter Definition */}
            <svg style={{ position: 'absolute', width: 0, height: 0 }}>
                <filter id="rough-edges">
                    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" result="noise" />
                    <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" />
                </filter>
            </svg>
        </>
    );
}

// --- REUSABLE COMPONENTS ---

// 1. The "Doodle" Button
export function BrutalButton({ children, color = "bg-[#ccff00]", className = "" }: any) {
    return (
        <button className={`relative group inline-block ${className}`}>
            <div className={`absolute inset-0 translate-x-2 translate-y-2 border-2 border-black bg-black transition-transform group-hover:translate-x-3 group-hover:translate-y-3`}></div>
            <div className={`relative px-8 py-4 border-2 border-black ${color} font-bold uppercase tracking-widest text-sm z-10 hover:-translate-y-1 hover:-translate-x-1 transition-transform`}>
                {children}
            </div>
        </button>
    );
}

// 2. Animated Doodle SVG
export function DrawSVG({ path, className }: any) {
    const pathRef = useRef<SVGPathElement>(null);
    useEffect(() => {
        gsap.fromTo(pathRef.current,
            { strokeDasharray: 1000, strokeDashoffset: 1000 },
            {
                strokeDashoffset: 0,
                duration: 1.5,
                ease: "power2.out",
                scrollTrigger: { trigger: pathRef.current, start: "top 80%" }
            }
        );
    }, []);
    return (
        <svg viewBox="0 0 200 100" className={`absolute pointer-events-none overflow-visible ${className}`}>
            <path ref={pathRef} d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ vectorEffect: 'non-scaling-stroke' }} />
        </svg>
    );
};

// --- SECTIONS ---

export function Navbar() {
    return (
        <nav className="fixed top-0 w-full z-50 flex justify-between items-center p-6 mix-blend-difference text-black">
            <div className="font-bold text-3xl tracking-tighter flex items-center gap-2">
                <div className="w-8 h-8 bg-black rounded-sm animate-spin-slow"></div>
                RAW_STUDIO.
            </div>
            <div className="hidden md:flex gap-8 font-mono uppercase text-sm font-bold bg-white/90 px-6 py-3 border-2 border-black rounded-full shadow-[4px_4px_0px_black]">
                <a href="#work" className="hover:text-[#b084ff]">Work</a>
                <a href="#about" className="hover:text-[#ff5e00]">Agency</a>
                <a href="#contact" className="hover:text-[#ccff00]">Contact</a>
            </div>
            <BrutalButton color="bg-white">Let's Talk</BrutalButton>
        </nav>
    );
}

export function Hero() {
    const container = useRef(null);

    // Parallax Mouse Effect
    useLayoutEffect(() => {
        const ctx = gsap.context(() => {
            window.addEventListener("mousemove", (e) => {
                const x = (e.clientX / window.innerWidth - 0.5);
                const y = (e.clientY / window.innerHeight - 0.5);

                gsap.to(".parallax-layer", { x: x * 50, y: y * 50, duration: 1 });
                gsap.to(".parallax-layer-rev", { x: x * -40, y: y * -40, duration: 1 });
            });

            // Intro Animation
            const tl = gsap.timeline();
            tl.from(".hero-char", {
                y: 200, rotate: 10, opacity: 0, stagger: 0.05, duration: 1, ease: "back.out(1.7)"
            }).from(".hero-tag", {
                scale: 0, rotation: -180, duration: 0.6, ease: "elastic.out(1, 0.5)"
            }, "-=0.5");

        }, container);
        return () => ctx.revert();
    }, []);

    return (
        <section ref={container} className="relative min-h-screen flex flex-col justify-center items-center overflow-hidden pt-20">

            {/* Background Grid */}
            <div className="absolute inset-0 z-0 opacity-10"
                style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '50px 50px' }}>
            </div>

            {/* Floating Elements (Parallax) */}
            <div className="parallax-layer-rev absolute top-20 left-10 md:left-32 z-10">
                <div className="bg-[#b084ff] border-2 border-black p-4 rotate-[-6deg] shadow-[4px_4px_0px_black]">
                    <Sparkles size={32} />
                </div>
            </div>
            <div className="parallax-layer absolute bottom-32 right-10 md:right-32 z-10">
                <div className="bg-[#ccff00] border-2 border-black rounded-full p-4 rotate-[12deg] shadow-[4px_4px_0px_black]">
                    <Zap size={32} />
                </div>
            </div>

            {/* Main Content */}
            <div className="relative z-20 text-center">
                <div className="hero-tag inline-block mb-6 bg-black text-white px-4 py-1 font-mono text-xs uppercase rotate-2">
                    Warning: High Voltage Design
                </div>

                <h1 className="text-[5rem] md:text-[10rem] leading-[0.85] font-bold uppercase tracking-tighter">
                    <div className="overflow-hidden">
                        {"DIGITAL".split("").map((c, i) => <span key={i} className="hero-char inline-block">{c}</span>)}
                    </div>
                    <div className="overflow-hidden relative">
                        <span className="text-outline absolute top-0 left-0 w-full z-0 translate-x-1 translate-y-1 opacity-50">ANARCHY</span>
                        {"ANARCHY".split("").map((c, i) => <span key={i} className="hero-char inline-block text-[#ff5e00]">{c}</span>)}

                        {/* Hand drawn loop */}
                        <DrawSVG path="M10,50 C30,90 170,90 190,50 C170,10 30,10 10,50" className="w-[120%] -left-[10%] -top-2 text-black" />
                    </div>
                </h1>

                <p className="max-w-xl mx-auto mt-8 font-mono text-lg md:text-xl relative">
                    <span className="font-marker text-2xl text-[#b084ff] absolute -left-8 -top-6 -rotate-12">v2.0</span>
                    We break grids, ignore safety margins, and ship award-winning code.
                    Strictly for the bold.
                </p>

                <div className="mt-12 flex flex-col md:flex-row gap-6 justify-center items-center">
                    <BrutalButton>Start Project</BrutalButton>
                    <div className="flex items-center gap-2 font-bold underline decoration-wavy decoration-[#ff5e00] cursor-pointer">
                        View Showreel <MoveRight />
                    </div>
                </div>
            </div>
        </section>
    );
};

export function StickyWorks() {
    const container = useRef<HTMLElement>(null);
    const wrapper = useRef<HTMLDivElement>(null);
    const projects = [
        { name: "NIKE UNLEASHED", cat: "WEBGL", img: "bg-[#ff5e00]" },
        { name: "SPOTIFY WRAPPED", cat: "DATA", img: "bg-[#b084ff]" },
        { name: "OFF-WHITE™", cat: "COMMERCE", img: "bg-[#ccff00]" },
    ];

    useLayoutEffect(() => {
        if (!container.current || !wrapper.current) return;

        const ctx = gsap.context(() => {
            const getScrollDistance = () => {
                if (!wrapper.current) return 0;
                return wrapper.current.scrollWidth - window.innerWidth;
            };

            gsap.to(wrapper.current, {
                x: () => -getScrollDistance(),
                ease: "none",
                scrollTrigger: {
                    trigger: container.current,
                    start: "top top",
                    end: () => `+=${getScrollDistance()}`,
                    pin: true,
                    scrub: 1,
                    invalidateOnRefresh: true,
                }
            });
        }, container);
        return () => ctx.revert();
    }, []);

    return (
        <section ref={container} className="overflow-hidden bg-black text-[#fffbf0] py-20 h-screen">
            <div ref={wrapper} className="flex h-full items-center pl-12 md:pl-32">
                {/* Title Block */}
                <div className="w-[80vw] md:w-[40vw] shrink-0 pr-20">
                    <h2 className="text-8xl font-black uppercase mb-8 leading-none">
                        Selected <br />
                        <span className="text-outline stroke-white text-transparent">Works</span>
                    </h2>
                    <div className="w-24 h-24 border-2 border-white rounded-full flex items-center justify-center animate-spin-slow">
                        <Star fill="white" />
                    </div>
                </div>

                {/* Cards */}
                {projects.map((p, i) => (
                    <div key={i} className="project-card w-[85vw] md:w-[60vw] h-[70vh] shrink-0 mr-12 md:mr-32 relative group">
                        {/* Back Card (Depth) */}
                        <div className={`absolute inset-0 bg-white border-2 border-white translate-x-4 translate-y-4 rounded-xl`}></div>

                        {/* Main Card */}
                        <div className={`relative h-full ${p.img} border-2 border-white rounded-xl p-8 flex flex-col justify-between transition-transform group-hover:-translate-y-2`}>
                            <div className="flex justify-between items-start">
                                <span className="font-mono bg-black text-white px-3 py-1 text-xl">(0{i + 1})</span>
                                <ArrowUpRight className="w-12 h-12 bg-white text-black rounded-full p-2 border-2 border-black transition-transform group-hover:rotate-45" />
                            </div>

                            <div>
                                <h3 className="text-5xl md:text-8xl font-black text-black uppercase tracking-tighter mb-4">{p.name}</h3>
                                <div className="flex gap-4">
                                    {["Strategy", "Design", p.cat].map(tag => (
                                        <span key={tag} className="border border-black px-4 py-1 rounded-full text-black font-bold uppercase text-xs md:text-sm">{tag}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
};

export function ChaosServices() {
    const services = [
        { title: "Strategy", desc: "We find the soul of your brand and turn it into noise.", color: "bg-[#ccff00]" },
        { title: "Visuals", desc: "Design that hits like a brick. No templates, no mercy.", color: "bg-[#b084ff]" },
        { title: "Code", desc: "Next-gen stack that moves at the speed of light.", color: "bg-[#ff5e00]" },
    ];

    return (
        <section className="py-32 px-6 container mx-auto">
            <div className="flex items-center gap-4 mb-16">
                <span className="font-marker text-4xl text-[#ff5e00] -rotate-12">WHAT WE DO_</span>
                <div className="h-2 bg-black flex-1 -rotate-1"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {services.map((s, i) => (
                    <div key={i} className={`p-12 border-4 border-black ${s.color} shadow-[12px_12px_0px_black] hover:translate-x-2 hover:translate-y-2 hover:shadow-none transition-all duration-300 relative group overflow-hidden`}>
                        <div className="absolute top-4 right-4 text-black/20 group-hover:text-black transition-colors">
                            <Plus size={48} strokeWidth={3} />
                        </div>
                        <h3 className="text-5xl font-black uppercase mb-6 leading-tight">{s.title}</h3>
                        <p className="font-mono text-lg font-bold uppercase leading-relaxed">{s.desc}</p>
                        <div className="mt-8">
                            <DrawSVG path="M0,0 Q50,20 100,0" className="w-32 h-8 text-black opacity-30 group-hover:opacity-100 transition-opacity" />
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

export function TeamScribbles() {
    const team = [
        { name: "ACE", role: "CREATIVE CHAOS", img: "https://api.dicebear.com/7.x/notionists/svg?seed=Ace" },
        { name: "ROUGE", role: "PIXEL ANARCHIST", img: "https://api.dicebear.com/7.x/notionists/svg?seed=Rouge" },
        { name: "VOID", role: "STACK MASTER", img: "https://api.dicebear.com/7.x/notionists/svg?seed=Void" },
        { name: "NOX", role: "MOTION GHOUL", img: "https://api.dicebear.com/7.x/notionists/svg?seed=Nox" }
    ];

    return (
        <section className="py-32 bg-black text-white relative overflow-hidden">
            <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(white 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
            
            <div className="container mx-auto px-6 text-center">
                <h2 className="text-6xl md:text-[9rem] font-black uppercase tracking-tighter mb-20 leading-none">
                    THE <span className="text-outline stroke-white text-transparent">PUNKS</span>
                </h2>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-12">
                    {team.map((t, i) => (
                        <div key={i} className="group cursor-crosshair">
                            <div className="relative aspect-square border-4 border-black bg-white/10 mb-6 overflow-hidden rounded-full group-hover:rounded-2xl transition-all duration-500">
                                <img src={t.img} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500 scale-110" alt={t.name} />
                                <div className="absolute inset-0 bg-[#ccff00]/80 mix-blend-multiply opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                {/* Scribble hover element */}
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all scale-0 group-hover:scale-100 duration-500">
                                    <Star size={80} fill="black" className="animate-spin-slow" />
                                </div>
                            </div>
                            <h3 className="text-2xl font-black uppercase tracking-tighter">{t.name}</h3>
                            <p className="font-marker text-[#ccff00] text-sm tracking-widest">{t.role}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

export function RawStats() {
    const stats = [
        { val: "24", label: "AWARDS WON", note: "NOT ENOUGH" },
        { val: "88", label: "CLIENT MESSES", note: "CLEANED" },
        { val: "100", label: "CAFFEINE %", note: "LEVELS" },
    ];

    return (
        <section className="py-32 px-6 container mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-20">
                {stats.map((s, i) => (
                    <div key={i} className="relative group flex flex-col items-center">
                        <div className="text-[12rem] md:text-[15rem] font-black leading-none relative">
                            {s.val}
                            {/* Marker line */}
                            <div className="absolute top-1/2 left-0 w-full h-8 bg-[#ccff00] -z-10 -rotate-3 group-hover:rotate-3 transition-transform duration-500" />
                        </div>
                        <div className="font-mono text-xl font-bold uppercase tracking-widest mt-4">
                            {s.label}
                        </div>
                        <div className="font-marker text-[#ff5e00] text-2xl rotate-[-12deg] absolute top-0 -right-4 group-hover:scale-110 transition-transform">
                            ({s.note})
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

export function ClientChaos() {
    return (
        <section className="py-32 bg-[#fffbf0] border-y-4 border-black overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 font-mono text-[8px] opacity-20 uppercase leading-none">
                {Array(20).fill("CLIENT_LOGS.EXE ").join("")}
            </div>
            <div className="container mx-auto px-6 text-center">
                <div className="flex flex-wrap justify-center gap-20 opacity-30 hover:opacity-100 transition-opacity duration-700 grayscale hover:grayscale-0">
                    {[1,2,3,4,5,6].map(i => (
                        <div key={i} className={`text-4xl md:text-6xl font-black uppercase tracking-tighter flex items-center gap-3 ${i % 2 === 0 ? "rotate-2" : "-rotate-3"}`}>
                            <div className="w-10 h-10 bg-black rounded-xs"></div>
                            CLIENT_0{i}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

export function StudioGallery() {
    const imgs = [
        "https://images.unsplash.com/photo-1541701494587-cb58502866ab?q=80&w=2670&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=2745&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2670&auto=format&fit=crop",
    ];

    return (
        <section className="py-32 px-6 container mx-auto">
            <h2 className="text-4xl font-black uppercase mb-16 tracking-tighter text-center">
                BEHIND THE <span className="text-[#ff5e00]">CURTAIN_</span>
            </h2>
            <div className="relative h-[600px] flex justify-center items-center">
                {imgs.map((img, i) => (
                    <div key={i} 
                         className="absolute w-[80vw] md:w-[600px] h-[400px] border-4 border-black bg-white p-3 shadow-[12px_12px_0px_black] transition-all hover:z-50 hover:scale-105"
                         style={{ 
                             transform: `translateX(${(i-1)*100}px) translateY(${(i-1)*30}px) rotate(${(i-1)*6}deg)`
                         }}>
                        <img src={img} className="w-full h-full object-cover border-2 border-black" alt="Gallery" />
                        <div className="absolute -bottom-6 -right-6 font-marker bg-[#ccff00] border-2 border-black px-4 py-1 text-black shadow-sm">
                            PIC. 0{i+1}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

export function Manifesto() {
    return (
        <section className="py-32 px-6 max-w-6xl mx-auto relative">
            <div className="absolute -left-10 top-20 text-[#ccff00]">
                <DrawSVG path="M0,0 Q50,50 10,100" className="w-32 h-32 rotate-12" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
                <div className="relative">
                    <div className="aspect-square bg-[#b084ff] border-2 border-black shadow-[8px_8px_0px_black] rotate-2 overflow-hidden group">
                        <div className="absolute inset-0 flex items-center justify-center text-9xl font-black opacity-20 group-hover:scale-150 transition-transform duration-700">?</div>
                    </div>
                    {/* Sticker */}
                    <div className="absolute -bottom-10 -right-10 bg-[#ff5e00] text-white p-6 rounded-full border-2 border-black rotate-12 font-marker text-xl shadow-[4px_4px_0px_black]">
                        NO BULLSHIT
                    </div>
                </div>

                <div>
                    <h2 className="text-5xl md:text-7xl font-bold uppercase mb-8">
                        We build <span className="relative inline-block">
                            LOUD
                            <svg className="absolute w-full h-full left-0 top-0 text-[#ccff00] -z-10 mix-blend-multiply" viewBox="0 0 100 40">
                                <path d="M0,20 Q50,0 100,20 L100,40 Q50,60 0,40 Z" fill="currentColor" />
                            </svg>
                        </span> brands.
                    </h2>
                    <p className="font-mono text-lg leading-relaxed mb-8">
                        Most websites are sleep-inducing. We are the caffeine.
                        We combine <span className="font-bold bg-[#ccff00] px-1">brutalist architecture</span> with
                        <span className="font-bold bg-[#b084ff] px-1 mx-1">hand-drawn chaos</span> to create
                        digital experiences that grab you by the collar.
                    </p>
                    <ul className="space-y-4 font-bold text-xl uppercase">
                        {["Pixel Perfect is Boring", "Chaos is memorable", "Motion is Emotion"].map((item, i) => (
                            <li key={i} className="flex items-center gap-4">
                                <Circle className="w-4 h-4 fill-black" /> {item}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </section>
    )
}

export function Marquee() {
    return (
        <div className="py-12 bg-[#ccff00] border-y-2 border-black overflow-hidden -rotate-1 my-12">
            <div className="flex gap-12 whitespace-nowrap animate-marquee">
                {[...Array(8)].map((_, i) => (
                    <div key={i} className="text-6xl md:text-8xl font-black uppercase flex items-center gap-8">
                        <span>Brutal</span>
                        <span className="text-outline stroke-black text-transparent">Design</span>
                        <Star fill="black" className="w-12 h-12 animate-spin-slow" />
                    </div>
                ))}
            </div>
            <style jsx>{`
            .animate-marquee { animation: marquee 10s linear infinite; }
            @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        `}</style>
        </div>
    );
}

export function Footer() {
    return (
        <footer className="relative pt-32 pb-12 px-6 border-t-2 border-black bg-[#101010] text-[#fffbf0]">
            <div className="max-w-7xl mx-auto flex flex-col items-center text-center">
                <div className="mb-8 rotate-6">
                    <div className="bg-white text-black px-6 py-2 font-marker text-xl border-2 border-black shadow-[4px_4px_0px_#ccff00]">
                        Say Hello!
                    </div>
                </div>

                <a href="mailto:hello@raw.studio" className="text-[10vw] font-black uppercase leading-none hover:text-[#ccff00] transition-colors duration-300">
                    hello@raw
                </a>

                <div className="w-full flex flex-col md:flex-row justify-between items-end mt-20 border-t border-gray-800 pt-8 font-mono text-sm uppercase">
                    <div className="text-left">
                        <p>Made with ❤️ + ☕️</p>
                        <p>Next.js / GSAP / Tailwind</p>
                    </div>
                    <div className="flex gap-6 mt-6 md:mt-0">
                        <a href="#" className="hover:underline decoration-[#ff5e00]">Instagram</a>
                        <a href="#" className="hover:underline decoration-[#b084ff]">Twitter</a>
                        <a href="#" className="hover:underline decoration-[#ccff00]">LinkedIn</a>
                    </div>
                </div>
            </div>

            {/* Abstract shapes */}
            <div className="absolute top-0 right-0 w-32 h-32 border-l-2 border-b-2 border-white opacity-20"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 border-r-2 border-t-2 border-white opacity-20"></div>
        </footer>
    );
}