"use client";
import React from "react";

// Generic error boundary, reusable by any future copilot card (Executive Copilot,
// Agent Copilot, Investor Copilot, ...). Contains no product-specific logic.
interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}
interface State {
  hasError: boolean;
}

export class CopilotErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("[copilot] UI error caught by boundary:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div style={{ fontSize: 13, color: "#94a3b8", padding: "8px 0" }}>
            Copilot unavailable right now.
          </div>
        )
      );
    }
    return this.props.children;
  }
}
