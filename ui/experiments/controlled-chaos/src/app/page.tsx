import {
  ChaosServices,
  ClientChaos,
  Footer,
  GlobalStyles,
  Hero,
  Manifesto,
  Marquee,
  Navbar,
  RawStats,
  StickyWorks,
  StudioGallery,
  TeamScribbles,
} from "@/components/ui/ControlledChaos";

export default function Page() {
  return (
    <main>
      <GlobalStyles />
      <div className="noise" aria-hidden="true" />
      <Navbar />
      <Hero />
      <Marquee />
      <StickyWorks />
      <ChaosServices />
      <Manifesto />
      <TeamScribbles />
      <RawStats />
      <ClientChaos />
      <StudioGallery />
      <Footer />
    </main>
  );
}
