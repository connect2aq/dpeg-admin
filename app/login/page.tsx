"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import Image from "next/image";

export default function LoginPage() {
  const { login, user, loading } = useAdminAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const err = await login(email, password);
    if (err) {
      setError(err);
      setSubmitting(false);
    } else router.push("/dashboard");
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-2"
      style={{ background: "var(--forest)" }}
    >
      {/* <div style={{ width: 400 }}> */}
      {/* Header */}
      {/* <div className="text-center mb-8"> */}
      <div
        style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.4)",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        Admin Portal
      </div>
      {/* DPEG Logo */}
      <Image
        src={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/logo_white_icon.svg`}
        alt="DPEG Logo"
        width={100}
        height={100}
      />
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: "var(--forest-light)",
        }}
      >
        DHANANI
      </div>
      <div
        style={{
          fontSize: 16,
          color: "rgba(255,255,255,0.7)",
        }}
      >
        Private Equity Group
      </div>
      {/* </div> */}

      {/* Card */}
      <div
        style={{
          background: "white",
          borderRadius: 16,
          padding: 36,
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#0e3416",
            marginBottom: 6,
          }}
        >
          Sign in to Admin
        </h2>
        <p style={{ fontSize: 14, color: "#64748b", marginBottom: 28 }}>
          Access restricted to administrators only.
        </p>

        {error && (
          <div
            style={{
              background: "#fee2e2",
              border: "1px solid #fca5a5",
              borderRadius: 8,
              padding: "12px 16px",
              marginBottom: 20,
              fontSize: 14,
              color: "#991b1b",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={submit}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "#374151",
                marginBottom: 6,
              }}
            >
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 14,
                boxSizing: "border-box",
              }}
              placeholder="admin@dpeg.com"
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "#374151",
                marginBottom: 6,
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 14,
                boxSizing: "border-box",
              }}
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              padding: "13px",
              background: submitting ? "#ccc" : "#699172",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 700,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
      {/* </div> */}
    </div>
  );
}
