import { Component, type ReactNode } from 'react';

// After a new version is published, a page this browser hasn't opened yet may point at a file that no longer exists.
// Vite reports that as a failed preload: reload once to pick up the new version.
if (typeof window !== 'undefined') window.addEventListener('vite:preloadError', () => {
  try { if (sessionStorage.getItem('fb:reloaded')) return; sessionStorage.setItem('fb:reloaded', '1'); } catch { /* storage off */ }
  window.location.reload();
});

/** If a page fails to open (an app update mid-session, or a bug), show a way out instead of a blank screen. */
export class PageBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(prev: { resetKey?: string }) { if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false }); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="center-screen" role="alert">
        <h1>This page didn't open</h1>
        <p className="lead">Usually that means the app was just updated. Reloading brings in the new version; nothing you saved is lost.</p>
        <button className="btn primary" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}
