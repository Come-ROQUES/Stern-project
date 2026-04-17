import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

/**
 * Global error boundary - prevents entire app from crashing.
 * Catches React rendering errors and displays a fallback UI.
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        this.setState({ errorInfo });
        // Log to console for debugging
        console.error("[ErrorBoundary] Caught error:", error);
        console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);
    }

    handleReload = () => {
        window.location.reload();
    };

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div
                    style={{
                        minHeight: "100vh",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                        padding: "2rem",
                    }}
                >
                    <div
                        style={{
                            maxWidth: "600px",
                            padding: "2rem",
                            background: "rgba(15, 23, 42, 0.9)",
                            borderRadius: "1rem",
                            border: "1px solid rgba(239, 68, 68, 0.3)",
                            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
                            <div
                                style={{
                                    width: "48px",
                                    height: "48px",
                                    borderRadius: "50%",
                                    background: "rgba(239, 68, 68, 0.2)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "24px",
                                }}
                            >
                                ⚠️
                            </div>
                            <div>
                                <h1 style={{ margin: 0, color: "#f87171", fontSize: "1.5rem" }}>Dashboard Crashed</h1>
                                <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.875rem" }}>
                                    An unexpected error occurred
                                </p>
                            </div>
                        </div>

                        <div
                            style={{
                                background: "rgba(0, 0, 0, 0.3)",
                                borderRadius: "0.5rem",
                                padding: "1rem",
                                marginBottom: "1.5rem",
                                fontFamily: "monospace",
                                fontSize: "0.8rem",
                                color: "#f87171",
                                maxHeight: "200px",
                                overflow: "auto",
                            }}
                        >
                            <strong>{this.state.error?.name}:</strong> {this.state.error?.message}
                            {this.state.errorInfo?.componentStack && (
                                <pre style={{ margin: "1rem 0 0", whiteSpace: "pre-wrap", color: "#94a3b8" }}>
                                    {this.state.errorInfo.componentStack.slice(0, 500)}
                                </pre>
                            )}
                        </div>

                        <div style={{ display: "flex", gap: "1rem" }}>
                            <button
                                onClick={this.handleReload}
                                style={{
                                    flex: 1,
                                    padding: "0.75rem 1.5rem",
                                    background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                                    border: "none",
                                    borderRadius: "0.5rem",
                                    color: "white",
                                    cursor: "pointer",
                                    fontWeight: 600,
                                }}
                            >
                                Reload Page
                            </button>
                            <button
                                onClick={this.handleReset}
                                style={{
                                    flex: 1,
                                    padding: "0.75rem 1.5rem",
                                    background: "transparent",
                                    border: "1px solid rgba(148, 163, 184, 0.3)",
                                    borderRadius: "0.5rem",
                                    color: "#94a3b8",
                                    cursor: "pointer",
                                    fontWeight: 600,
                                }}
                            >
                                Try Again
                            </button>
                        </div>

                        <p style={{ marginTop: "1.5rem", color: "#64748b", fontSize: "0.75rem", textAlign: "center" }}>
                            If this persists, check the API status at{" "}
                            <code>/react-api/api/health</code>
                        </p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
