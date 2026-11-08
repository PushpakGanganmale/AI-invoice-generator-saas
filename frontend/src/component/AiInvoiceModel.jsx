import React, { useEffect, useState } from "react";
import GeminiIcon from "./GeminiIcon";

const AiInvoiceModal = ({ open, onClose, onGenerate }) => {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setText("");
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  const handleGenerate = async () => {
    if (!text.trim()) return;

    try {
      setLoading(true);
      await onGenerate(text);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

      {/* Modal */}
      <div className="bg-white rounded-xl w-160 shadow-xl p-6 relative">

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 text-xl"
        >
          ✕
        </button>

        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <GeminiIcon className="w-5 h-5" />
          <h2 className="text-lg font-semibold text-gray-800">
            Create Invoice with AI
          </h2>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-500 mb-4">
          Paste any text that contains invoice details (client, items, qty,
          prices) and we’ll attempt to extract an invoice
        </p>

        {/* Label */}
        <label className="text-sm text-gray-700 mb-2 block">
          Paste invoice text
        </label>

        {/* Textarea */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={`eg. A person wants a logo design for her organic brand "GreenVibe."
Quoted for $120 for 2 logo options and final delivery in PNG and vector format`}
          className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />

        {/* Footer */}
        <div className="flex justify-end mt-5">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2 rounded-full bg-linear-to-r from-blue-500 to-blue-600 text-white text-sm shadow-md hover:scale-105 transition"
          >
            ✨ {loading ? "Generating..." : "Generate"}
          </button>
        </div>

      </div>
    </div>
  );
};

export default AiInvoiceModal;

