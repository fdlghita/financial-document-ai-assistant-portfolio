function Header({ activePage }) {
  const titles = {
    dashboard: "Document Intelligence Dashboard",
    ai: "AI Document Assistant",
    documents: "Document Library",
  };

  const descriptions = {
    dashboard: "Explore indexed documents, conversations and AI workflows.",
    ai: "Ask questions about uploaded documents using a local language model.",
    documents: "Upload, search and manage your indexed PDF documents.",
  };

  return (
    <header className="v2-header v2-card">
      <div>
        <span className="v2-pill">Financial Document AI Assistant</span>
        <h1>{titles[activePage]}</h1>
        <p>{descriptions[activePage]}</p>
      </div>
    </header>
  );
}

export default Header;