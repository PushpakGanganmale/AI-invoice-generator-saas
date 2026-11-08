import React from "react";

const AnimatedButton = ({ children, loading, onClick }) => {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        padding: "10px 18px",
        borderRadius: "8px",
        background: "#6366f1",
        color: "white",
        border: "none",
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.7 : 1,
        fontWeight: 500,
        transition: "all 0.2s ease"
      }}
    >
      {loading ? "Generating..." : children}
    </button>
  );
};

export default AnimatedButton;
