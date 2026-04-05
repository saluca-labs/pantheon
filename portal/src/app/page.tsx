"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

/** Landing page -- animated hero section, feature grid, and pricing CTA. */

/* ─── Animation Variants ─── */

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: i * 0.15, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

/* ─── Animated Counter Hook ─── */

function useCountUp(target: number, inView: boolean, duration = 2000) {
  const [count, setCount] = useState(0);
  const hasRun = useRef(false);
  useEffect(() => {
    if (!inView || hasRun.current) return;
    hasRun.current = true;
    const start = performance.now();
    function step(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, [inView, target, duration]);
  return count;
}

/* ─── SVG Icons (inline, no dependencies) ─── */

function ShieldKeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l7 4v5c0 5.25-3.5 9.74-7 11-3.5-1.26-7-5.75-7-11V6l7-4z" />
      <circle cx="12" cy="10" r="2" />
      <path d="M12 12v4" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function GateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
    </svg>
  );
}

function FingerprintIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4" />
      <path d="M5 19.5C5.5 18 6 15 6 12c0-3.5 2.5-6 6-6 1.5 0 3 .5 4 1.5" />
      <path d="M9 12c0-1.7 1.3-3 3-3 .8 0 1.5.3 2 .8" />
      <path d="M12 12v8c0 1-0.5 2-1.5 3" />
      <path d="M18 12c0 4-1 8-4 11" />
      <path d="M22 12c0 4.5-1.5 8.5-4 11" />
    </svg>
  );
}

function CheckShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l7 4v5c0 5.25-3.5 9.74-7 11-3.5-1.26-7-5.75-7-11V6l7-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function RadarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2v4M12 18v4" />
    </svg>
  );
}

/* ─── Section: Hero ─── */

function Hero() {

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Layered animated gradient mesh background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-navy-950" />
        <div
          className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full opacity-[0.07]"
          style={{
            background: "radial-gradient(circle, var(--gold-500) 0%, transparent 70%)",
            animation: "pulse-slow 8s ease-in-out infinite",
          }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full opacity-[0.05]"
          style={{
            background: "radial-gradient(circle, var(--teal-500) 0%, transparent 70%)",
            animation: "pulse-slow 10s ease-in-out infinite reverse",
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-[0.03]"
          style={{
            background: "radial-gradient(circle, var(--gold-400) 0%, transparent 60%)",
            animation: "pulse-slow 12s ease-in-out infinite 2s",
          }}
        />
        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(212,168,83,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(212,168,83,0.3) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />
        {/* Constellation particle dots (CSS animated) */}
        {[
          { top: "15%", left: "10%", delay: "0s", dur: "7s" },
          { top: "25%", left: "85%", delay: "1s", dur: "9s" },
          { top: "60%", left: "5%", delay: "2s", dur: "8s" },
          { top: "70%", left: "90%", delay: "0.5s", dur: "10s" },
          { top: "40%", left: "20%", delay: "3s", dur: "7.5s" },
          { top: "30%", left: "70%", delay: "1.5s", dur: "8.5s" },
          { top: "80%", left: "30%", delay: "2.5s", dur: "9.5s" },
          { top: "10%", left: "50%", delay: "4s", dur: "7s" },
          { top: "55%", left: "75%", delay: "0.8s", dur: "11s" },
          { top: "85%", left: "60%", delay: "3.5s", dur: "8s" },
          { top: "45%", left: "45%", delay: "1.2s", dur: "9s" },
          { top: "20%", left: "35%", delay: "2.8s", dur: "10s" },
        ].map((p, i) => (
          <div
            key={i}
            className="particle"
            style={{
              top: p.top,
              left: p.left,
              animationDelay: p.delay,
              animationDuration: p.dur,
              width: i % 3 === 0 ? "3px" : "2px",
              height: i % 3 === 0 ? "3px" : "2px",
              background: i % 2 === 0 ? "var(--gold-400)" : "var(--teal-400)",
            }}
          />
        ))}
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center">
        <div className="mx-auto max-w-3xl">
          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-border-accent px-4 py-1.5"
          >
            <span className="h-2 w-2 rounded-full bg-gold-500 pulse-glow" />
            <span className="text-xs font-medium text-gold-400 tracking-wide uppercase">SoulAuth is Generally Available</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight"
          >
            <span className="text-gradient-gold">Tiresias</span> sees threats.
            <br />
            <span className="text-foreground-muted">Never data.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-8 text-lg sm:text-xl text-foreground-muted leading-relaxed max-w-2xl mx-auto"
          >
            Zero-knowledge agent security for the enterprise. Identity, authorization,
            and runtime protection - without ever accessing your data.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7 }}
            className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/trial"
              className="rounded-xl bg-white px-10 py-4 text-sm font-bold text-navy-950 hover:bg-gold-300 transition-all duration-300 shadow-[0_0_30px_rgba(255,255,255,0.15),0_0_60px_rgba(212,168,83,0.1)] ring-1 ring-white/20 hover:ring-gold-400/50 hover:shadow-[0_0_40px_rgba(212,168,83,0.25)]"
            >
              Start Free Trial
            </Link>
            <Link
              href="/developers"
              className="rounded-lg border border-border-hover px-8 py-3.5 text-sm font-semibold text-foreground hover:bg-navy-800/50 transition-all"
            >
              Read the Docs
            </Link>
          </motion.div>
        </div>

        {/* Hero image - blended into background */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.9, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mt-16 mx-auto max-w-3xl pointer-events-none select-none"
        >
          <div className="relative">
            <img
              src="/tiresias-hero.png"
              alt="Tiresias - The blind prophet of AI security"
              className="w-full h-auto opacity-80 mix-blend-lighten"
            />
            {/* Extra gradient overlay to blend edges further into the page background */}
            <div className="absolute inset-0 bg-gradient-to-t from-navy-950 via-navy-950/20 to-navy-950/40" />
            <div className="absolute inset-0 bg-gradient-to-l from-navy-950/60 via-transparent to-navy-950/60" />
          </div>
        </motion.div>

      </div>

      <style>{`
        @keyframes pulse-slow {
          0%, 100% { transform: scale(1); opacity: 0.07; }
          50% { transform: scale(1.15); opacity: 0.12; }
        }
      `}</style>
    </section>
  );
}

/* ─── Section: Problem Statement ─── */

function AnimatedStat({ value, suffix, label }: { value: number; suffix?: string; label: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const count = useCountUp(value, inView);

  return (
    <motion.div
      ref={ref}
      variants={scaleIn}
      className="glass-card rounded-2xl p-8 text-center card-hover-lift"
    >
      <p className="text-5xl font-bold text-gradient-gold font-mono">
        {count}{suffix}
      </p>
      <p className="mt-3 text-sm text-foreground-muted leading-relaxed">
        {label}
      </p>
    </motion.div>
  );
}

function ProblemStatement() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-28 sm:py-36">
      <div className="section-divider" />
      <div ref={ref} className="mx-auto max-w-7xl px-6 lg:px-8 pt-28 sm:pt-36">
        <motion.div
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          variants={staggerContainer}
          className="mx-auto max-w-2xl text-center"
        >
          <motion.h2
            variants={fadeUp}
            custom={0}
            className="text-3xl sm:text-4xl font-bold tracking-tight"
          >
            AI agents are the{" "}
            <span className="text-gradient-teal">new attack surface</span>
          </motion.h2>
          <motion.p
            variants={fadeUp}
            custom={1}
            className="mt-6 text-lg text-foreground-muted leading-relaxed"
          >
            Every autonomous agent is an identity without governance. They call APIs,
            access data stores, and communicate with other agents - all with implicit
            trust and zero audit trails. Traditional IAM was never built for this.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6"
        >
          <AnimatedStat value={73} suffix="%" label="of enterprises deploy AI agents in production" />
          <AnimatedStat value={12} label="implicit permissions per agent on average" />
          <AnimatedStat value={0} label="visibility into agent-to-agent traffic" />
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-6 text-center text-xs text-foreground-subtle"
        >
          Statistics are illustrative, based on industry trends and research estimates.
        </motion.p>
      </div>
    </section>
  );
}

/* ─── Section: Platform Overview ─── */

function PlatformOverview() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  const products = [
    {
      name: "SoulAuth",
      tagline: "Agent Identity & Zero-Trust Auth",
      description:
        "Cryptographic agent identity, just-in-time authorization, and policy-as-code. Every agent request is verified. No standing permissions. No implicit trust.",
      badge: "GA",
      badgeColor: "bg-teal-600/20 text-teal-400",
      accentColor: "gold",
      icon: ShieldKeyIcon,
      href: "/platform/soulauth",
      cta: "Explore SoulAuth",
    },
    {
      name: "SoulWatch",
      tagline: "AI Runtime Security Monitoring",
      description:
        "Real-time behavioral analytics for your agent fleet. Sigma-compatible detection rules, anomaly scoring, and automated alerting - without reading agent payloads.",
      badge: "GA",
      badgeColor: "bg-teal-600/20 text-teal-400",
      accentColor: "teal",
      icon: EyeIcon,
      href: "/platform/soulwatch",
      cta: "Explore SoulWatch",
    },
    {
      name: "SoulGate",
      tagline: "API Security Gateway",
      description:
        "Secure the perimeter between your agents and the outside world. Rate limiting, schema validation, and threat detection at the API layer.",
      badge: "GA",
      badgeColor: "bg-teal-600/20 text-teal-400",
      accentColor: "teal",
      icon: GateIcon,
      href: "/platform/soulgate",
      cta: "Explore SoulGate",
    },
  ];

  return (
    <section className="py-28 sm:py-36">
      <div className="section-divider" />
      <div ref={ref} className="mx-auto max-w-7xl px-6 lg:px-8 pt-28 sm:pt-36">
        <motion.div
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          variants={staggerContainer}
          className="mx-auto max-w-2xl text-center"
        >
          <motion.h2 variants={fadeUp} custom={0} className="text-3xl sm:text-4xl font-bold tracking-tight">
            The <span className="text-gradient-gold">Soul*</span> Platform
          </motion.h2>
          <motion.p variants={fadeUp} custom={1} className="mt-4 text-lg text-foreground-muted">
            End-to-end agent security. From identity to runtime to the API edge.
          </motion.p>
        </motion.div>

        <div className="mt-16 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {products.map((product, i) => {
            const isGold = product.accentColor === "gold";
            return (
              <motion.div
                key={product.name}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.92 }}
                transition={{ delay: 0.3 + i * 0.15, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                className={`glass-card rounded-2xl p-8 flex flex-col transition-all duration-300 card-hover-lift group ${
                  isGold ? "hover:border-border-accent glow-gold" : "hover:border-teal-600/30"
                }`}
                style={{ perspective: "1000px" }}
              >
                <div className="flex items-center justify-between mb-6">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110 ${
                      isGold
                        ? "bg-gold-500/10 text-gold-400"
                        : "bg-teal-500/10 text-teal-400"
                    }`}
                  >
                    <product.icon className="h-6 w-6" />
                  </div>
                  <span className={`text-[10px] font-semibold px-3 py-1 rounded-full uppercase tracking-wider ${product.badgeColor}`}>
                    {product.badge}
                  </span>
                </div>

                <h3 className={`text-xl font-bold ${isGold ? "text-gold-400" : "text-teal-400"}`}>
                  {product.name}
                </h3>
                <p className="text-sm text-foreground-muted mt-1 font-medium">
                  {product.tagline}
                </p>
                <p className="mt-4 text-sm text-foreground-muted leading-relaxed flex-grow">
                  {product.description}
                </p>

                <Link
                  href={product.href}
                  className={`mt-6 inline-flex items-center text-sm font-semibold transition-colors ${
                    isGold
                      ? "text-gold-400 hover:text-gold-300"
                      : "text-teal-400 hover:text-teal-300"
                  }`}
                >
                  {product.cta}
                  <svg className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5-5 5M6 12h12" />
                  </svg>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── Section: How It Works ─── */

function HowItWorks() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  const steps = [
    {
      step: "01",
      title: "Identity",
      description:
        "Every agent gets a cryptographic soulkey identity. Hardware-bound, non-extractable, and verifiable across your entire fleet.",
      icon: FingerprintIcon,
    },
    {
      step: "02",
      title: "Authorize",
      description:
        "Zero-trust policy evaluation on every request. Just-in-time permissions, no standing access. Policies defined as code, synced from git.",
      icon: CheckShieldIcon,
    },
    {
      step: "03",
      title: "Protect",
      description:
        "Runtime monitoring, behavioral anomaly detection, and automated quarantine response. Seven response actions, from alert to full isolation.",
      icon: RadarIcon,
    },
  ];

  return (
    <section className="py-28 sm:py-36 relative overflow-hidden">
      <div className="section-divider" />
      {/* Subtle bg accent */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] opacity-[0.04] rounded-full"
        style={{ background: "radial-gradient(circle, var(--teal-500) 0%, transparent 70%)" }}
      />

      <div ref={ref} className="mx-auto max-w-7xl px-6 lg:px-8 relative pt-28 sm:pt-36">
        <motion.div
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          variants={staggerContainer}
          className="mx-auto max-w-2xl text-center"
        >
          <motion.h2 variants={fadeUp} custom={0} className="text-3xl sm:text-4xl font-bold tracking-tight">
            How it <span className="text-gradient-teal">works</span>
          </motion.h2>
          <motion.p variants={fadeUp} custom={1} className="mt-4 text-lg text-foreground-muted">
            Three layers of defense. One unified platform.
          </motion.p>
        </motion.div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((item, i) => (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
              transition={{ delay: 0.3 + i * 0.2, duration: 0.6 }}
              className="relative"
            >
              {/* Animated connector line (hidden on mobile, hidden after last) */}
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-12 left-[calc(50%+40px)] w-[calc(100%-80px)] h-px overflow-hidden">
                  <motion.div
                    initial={{ width: "0%" }}
                    animate={inView ? { width: "100%" } : { width: "0%" }}
                    transition={{ delay: 0.8 + i * 0.3, duration: 0.8, ease: "easeOut" }}
                    className="h-px bg-gradient-to-r from-teal-500/40 to-transparent"
                  />
                </div>
              )}

              <div className="text-center">
                <div className="inline-flex h-24 w-24 items-center justify-center rounded-2xl bg-navy-800/50 border border-border mb-6 transition-all duration-300 hover:border-teal-500/30 hover:bg-navy-800/80">
                  <item.icon className="h-10 w-10 text-teal-400" />
                </div>
                <p className="text-xs font-mono text-gold-500 tracking-widest mb-2">
                  STEP {item.step}
                </p>
                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                <p className="text-sm text-foreground-muted leading-relaxed max-w-xs mx-auto">
                  {item.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Section: Privacy-First Architecture ─── */

function PrivacyFirst() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-28 sm:py-36 relative overflow-hidden">
      <div className="section-divider" />
      <div ref={ref} className="mx-auto max-w-7xl px-6 lg:px-8 pt-28 sm:pt-36">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Copy */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              We can&apos;t see your data.{" "}
              <span className="text-gradient-gold">That&apos;s the point.</span>
            </h2>
            <p className="mt-6 text-lg text-foreground-muted leading-relaxed">
              Tiresias is built on a zero-knowledge architecture. We verify identities,
              evaluate policies, and detect anomalies - all without accessing, storing,
              or transmitting your agent payloads. Metadata flows through. Data never does.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                "Agent payloads never leave your infrastructure",
                "Policy evaluation uses metadata, not content",
                "Cryptographic proofs replace data inspection",
                "Designed with GDPR Article 25 principles in mind",
              ].map((item, i) => (
                <motion.li
                  key={item}
                  initial={{ opacity: 0, x: -20 }}
                  animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                  transition={{ delay: 0.4 + i * 0.1, duration: 0.4 }}
                  className="flex items-start gap-3"
                >
                  <svg className="h-5 w-5 mt-0.5 text-gold-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-foreground-muted">{item}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          {/* Visual: abstract data flow */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: 30 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="relative flex items-center justify-center"
          >
            <div className="relative w-full max-w-md aspect-square animate-float" style={{ animationDuration: "8s" }}>
              {/* Outer ring */}
              <div className="absolute inset-0 rounded-full border border-border opacity-40" />
              {/* Middle ring */}
              <div className="absolute inset-8 rounded-full border border-border-accent opacity-30" />
              {/* Inner core */}
              <div className="absolute inset-20 rounded-full bg-gradient-to-br from-gold-500/10 to-teal-500/10 border border-border-accent/30 flex items-center justify-center">
                <div className="text-center">
                  <svg className="h-10 w-10 mx-auto text-gold-400 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="10" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <p className="text-xs font-mono text-gold-400">ZERO</p>
                  <p className="text-xs font-mono text-gold-400">KNOWLEDGE</p>
                </div>
              </div>

              {/* Data flow indicators */}
              {[0, 60, 120, 180, 240, 300].map((deg) => (
                <div
                  key={deg}
                  className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full bg-teal-400/40"
                  style={{
                    transform: `rotate(${deg}deg) translateY(-140px) rotate(-${deg}deg)`,
                    animation: `pulse-slow 3s ease-in-out infinite ${deg * 10}ms`,
                  }}
                />
              ))}

              {/* Flow arrows (metadata passing through) */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
                <span className="text-[10px] font-mono text-teal-400/60 tracking-wider">METADATA</span>
                <svg className="h-4 w-4 text-teal-400/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
                <svg className="h-4 w-4 text-teal-400/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                <span className="text-[10px] font-mono text-teal-400/60 tracking-wider">VERDICT</span>
              </div>

              {/* Blocked data indicator */}
              <div className="absolute top-1/2 right-0 -translate-y-1/2 flex items-center gap-1">
                <svg className="h-4 w-4 text-red-400/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-[10px] font-mono text-red-400/40 tracking-wider">DATA</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ─── Section: Enterprise Features ─── */

function EnterpriseFeatures() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  const features = [
    {
      title: "Policy-as-Code",
      description:
        "Define authorization policies in YAML, version them in git, and deploy through CI/CD. No console clicks, no drift.",
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
          <line x1="14" y1="4" x2="10" y2="20" />
        </svg>
      ),
    },
    {
      title: "SIEM Integration",
      description:
        "Native connectors for Splunk, Elastic, and Microsoft Sentinel. Stream security events in real-time to your existing SOC workflow.",
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      ),
    },
    {
      title: "Sigma Detection Rules",
      description:
        "SOC-compatible Sigma rules for agent behavior detection. Use your existing detection engineering pipeline.",
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
    },
    {
      title: "Multi-Tenancy",
      description:
        "Tenant isolation with row-level security. Each tenant gets its own policy namespace, audit trail, and key hierarchy.",
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="18" rx="2" />
          <line x1="2" y1="9" x2="22" y2="9" />
          <line x1="10" y1="9" x2="10" y2="21" />
        </svg>
      ),
    },
    {
      title: "Automated Quarantine",
      description:
        "Seven graduated response actions - from soft alerts to full agent isolation. Automated, policy-driven, and audit-logged.",
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l7 4v5c0 5.25-3.5 9.74-7 11-3.5-1.26-7-5.75-7-11V6l7-4z" />
          <line x1="8" y1="11" x2="16" y2="11" />
        </svg>
      ),
    },
    {
      title: "Compliance Ready",
      description:
        "Architecture designed with data protection by design principles. Exportable audit logs and policy versioning support your compliance journey.",
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M9 15l2 2 4-4" />
        </svg>
      ),
    },
  ];

  return (
    <section className="py-28 sm:py-36">
      <div className="section-divider" />
      <div ref={ref} className="mx-auto max-w-7xl px-6 lg:px-8 pt-28 sm:pt-36">
        <motion.div
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          variants={staggerContainer}
          className="mx-auto max-w-2xl text-center"
        >
          <motion.h2 variants={fadeUp} custom={0} className="text-3xl sm:text-4xl font-bold tracking-tight">
            Built for the <span className="text-gradient-teal">enterprise</span>
          </motion.h2>
          <motion.p variants={fadeUp} custom={1} className="mt-4 text-lg text-foreground-muted">
            Production-grade security infrastructure, not another proof-of-concept.
          </motion.p>
        </motion.div>

        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ delay: 0.2 + i * 0.1, duration: 0.5 }}
              className="glass-card rounded-2xl p-8 card-hover-lift group"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy-800 border border-border text-teal-400 mb-5 transition-all duration-300 group-hover:border-teal-500/30 group-hover:bg-navy-800/80">
                {feature.icon}
              </div>
              <h3 className="text-base font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-foreground-muted leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Section: Final CTA ─── */

function FinalCTA() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-28 sm:py-36 relative overflow-hidden">
      <div className="section-divider" />
      {/* BG accent */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          background:
            "radial-gradient(ellipse at center, var(--gold-500) 0%, transparent 60%)",
        }}
      />

      <div ref={ref} className="mx-auto max-w-7xl px-6 lg:px-8 relative pt-28 sm:pt-36">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.7 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Ready to secure your{" "}
            <span className="text-gradient-gold">AI agents</span>?
          </h2>
          <p className="mt-4 text-lg text-foreground-muted">
            Join the waitlist. Be among the first to secure your AI agents.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/trial"
              className="rounded-xl bg-white px-10 py-4 text-sm font-bold text-navy-950 hover:bg-gold-300 transition-all duration-300 shadow-[0_0_30px_rgba(255,255,255,0.15),0_0_60px_rgba(212,168,83,0.1)] ring-1 ring-white/20 hover:ring-gold-400/50 hover:shadow-[0_0_40px_rgba(212,168,83,0.25)]"
            >
              Start Free Trial
            </Link>
            <Link
              href="/company#contact"
              className="rounded-lg border border-border-hover px-8 py-3.5 text-sm font-semibold text-foreground hover:bg-navy-800/50 transition-all"
            >
              Talk to Sales
            </Link>
          </div>

          <p className="mt-8 text-xs text-foreground-subtle">
            Free for individuals, students, and startups under $1M ARR — 25 managed agents, 7-day retention.
            Enterprise plans available.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Page ─── */

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <ProblemStatement />
        <PlatformOverview />
        <HowItWorks />
        <PrivacyFirst />
        <EnterpriseFeatures />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
