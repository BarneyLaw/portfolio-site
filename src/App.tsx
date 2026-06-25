import { useState } from "react";
import { Nav } from "./components/layout/Nav";
import { Footer } from "./components/layout/Footer";
import { HomePage } from "./pages/HomePage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { BlogPage } from "./pages/BlogPage";
import { ReviewsPage } from "./pages/ReviewsPage";
import { AboutPage } from "./pages/AboutPage";
import type { Page } from "./types";

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [dark, setDark] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  function handleNav(p: Page) {
    setPage(p);
    setSelectedProject(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleSelectProject(id: string) {
    setSelectedProject(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBackToProjects() {
    setSelectedProject(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div
      className={`min-h-screen flex flex-col bg-background text-foreground font-mono ${dark ? "dark" : ""}`}
      style={{ fontFamily: "'Space Mono', monospace" }}
    >
      <Nav
        page={page}
        dark={dark}
        onNav={handleNav}
        onToggleDark={() => setDark((d) => !d)}
      />

      <div className="flex-1">
        {page === "home" && <HomePage onNav={handleNav} />}
        {page === "projects" &&
          (selectedProject ? (
            <ProjectDetailPage
              projectId={selectedProject}
              onBack={handleBackToProjects}
            />
          ) : (
            <ProjectsPage onSelect={handleSelectProject} />
          ))}
        {page === "blog" && <BlogPage />}
        {page === "reviews" && <ReviewsPage />}
        {page === "about" && <AboutPage />}
      </div>

      <Footer />
    </div>
  );
}
