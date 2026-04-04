import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `: ${this.props.name}` : ''}]`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-6 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-8 h-8 text-red-500 mb-3" />
          <h3 className="text-sm font-semibold text-red-900 mb-1">
            {this.props.name ? `${this.props.name} failed to load` : 'Something went wrong'}
          </h3>
          <p className="text-xs text-red-700 mb-3 text-center max-w-md">
            {this.state.error?.message || 'An unexpected error occurred in this section.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="gap-2 text-red-700 border-red-300 hover:bg-red-100"
          >
            <RefreshCw className="w-3 h-3" />
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
