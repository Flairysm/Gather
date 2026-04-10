"use client";

import { FormEvent, useEffect, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { adminAction } from "@/lib/adminAction";
import { adminQuery } from "@/lib/adminQuery";

type FeaturedBanner = {
  id: string;
  image_url: string;
  target_url: string | null;
  heading: string | null;
  subheading: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
};

export default function FeaturedBannersPage() {
  const [rows, setRows] = useState<FeaturedBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [sourceType, setSourceType] = useState<"url" | "upload">("url");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [targetUrl, setTargetUrl] = useState("");
  const [heading, setHeading] = useState("");
  const [subheading, setSubheading] = useState("");
  const [priority, setPriority] = useState("100");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteBannerId, setDeleteBannerId] = useState<string | null>(null);
  const [deletingBanner, setDeletingBanner] = useState(false);

  async function loadRows() {
    setLoading(true);
    setError(null);

    const { data, error: queryError } = await adminQuery<FeaturedBanner>({
      table: "featured_banners",
      select: "id, image_url, target_url, heading, subheading, priority, is_active, created_at",
      order: [{ column: "priority", ascending: true }, { column: "created_at", ascending: false }],
    });

    if (queryError) {
      setError(queryError);
      setLoading(false);
      return;
    }

    setRows(data);
    setLoading(false);
  }

  useEffect(() => {
    loadRows();
  }, []);

  async function uploadSelectedFile() {
    if (!imageFile) return null;

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", imageFile);
      form.append("bucket", "featured-banners");

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const text = await res.text();
      let data: { url?: string; error?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setError(text?.slice(0, 120) || "Upload failed");
        return null;
      }

      if (!res.ok || data.error) {
        setError(data.error ?? "Upload failed");
        return null;
      }
      return data.url as string;
    } catch (err: any) {
      setError(err.message ?? "Upload failed");
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function runDeleteBanner(id: string) {
    setDeletingBanner(true);
    const { ok, error: err } = await adminAction("banner.delete", { id });
    setDeletingBanner(false);
    if (!ok) {
      setError(err ?? "Failed to delete banner");
      return;
    }
    await loadRows();
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const parsedPriority = Number.parseInt(priority, 10);
    if (Number.isNaN(parsedPriority)) {
      setError("Priority must be a number.");
      return;
    }

    setSaving(true);

    let finalImageUrl = imageUrl.trim();
    if (sourceType === "upload") {
      if (!imageFile) {
        setSaving(false);
        setError("Please choose an image file to upload.");
        return;
      }

      const uploadedUrl = await uploadSelectedFile();
      if (!uploadedUrl) {
        setSaving(false);
        return;
      }
      finalImageUrl = uploadedUrl;
    } else if (!finalImageUrl) {
      setSaving(false);
      setError("Image URL is required.");
      return;
    }

    const payload = {
      image_url: finalImageUrl,
      target_url: targetUrl.trim() || null,
      heading: heading.trim() || null,
      subheading: subheading.trim() || null,
      priority: parsedPriority,
      is_active: true,
    };

    const { ok, error: actionErr } = await adminAction("banner.upsert", {
      id: editingId ?? undefined,
      payload,
    });
    setSaving(false);

    if (!ok) {
      setError(actionErr ?? "Failed to save banner");
      return;
    }

    setImageUrl("");
    setImageFile(null);
    setTargetUrl("");
    setHeading("");
    setSubheading("");
    setPriority("100");
    setEditingId(null);
    await loadRows();
  }

  async function setActive(id: string, active: boolean) {
    const { ok, error: err } = await adminAction("banner.setActive", { id, active });
    if (!ok) {
      setError(err ?? "Failed to update banner");
      return;
    }
    await loadRows();
  }

  function startEdit(row: FeaturedBanner) {
    setEditingId(row.id);
    setSourceType("url");
    setImageFile(null);
    setImageUrl(row.image_url);
    setTargetUrl(row.target_url ?? "");
    setHeading(row.heading ?? "");
    setSubheading(row.subheading ?? "");
    setPriority(String(row.priority));
  }

  function cancelEdit() {
    setEditingId(null);
    setImageUrl("");
    setImageFile(null);
    setTargetUrl("");
    setHeading("");
    setSubheading("");
    setPriority("100");
    setSourceType("url");
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Featured Banners</h1>
        <p className="mt-1 text-sm text-slate-400">
          Manage home hero banners. Lower priority number appears first.
        </p>
      </div>

      <form
        className="mb-6 grid gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4 md:grid-cols-4"
        onSubmit={handleCreate}
      >
        <div className="md:col-span-4">
          <div className="inline-flex rounded-lg border border-slate-700 p-1">
            <button
              type="button"
              onClick={() => setSourceType("url")}
              className={`rounded-md px-3 py-1.5 text-xs ${
                sourceType === "url"
                  ? "bg-sky-500 text-slate-950"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              Use Image URL
            </button>
            <button
              type="button"
              onClick={() => setSourceType("upload")}
              className={`rounded-md px-3 py-1.5 text-xs ${
                sourceType === "upload"
                  ? "bg-sky-500 text-slate-950"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              Upload Image File
            </button>
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-slate-400">
            {sourceType === "url" ? "Image URL" : "Image File"}
          </label>
          {sourceType === "url" ? (
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none ring-sky-500 focus:ring-2"
            />
          ) : (
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:text-slate-200"
            />
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Target URL</label>
          <input
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none ring-sky-500 focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Priority</label>
          <input
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            placeholder="100"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none ring-sky-500 focus:ring-2"
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-slate-400">Heading</label>
          <input
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            placeholder="e.g. NATIONAL CARD EXPO"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none ring-sky-500 focus:ring-2"
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-slate-400">Subheading</label>
          <input
            value={subheading}
            onChange={(e) => setSubheading(e.target.value)}
            placeholder="e.g. VIRTUAL ACCESS • LIVE NOW"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none ring-sky-500 focus:ring-2"
          />
        </div>

        <div className="md:col-span-4">
          <button
            type="submit"
            disabled={saving || uploading}
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
          >
            {saving || uploading
              ? "Saving..."
              : editingId
                ? "Update Banner"
                : "Add Banner"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Cancel Edit
            </button>
          )}
        </div>
      </form>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-700/40 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
          Loading banners...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
          No featured banners yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-950">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Text</th>
                <th className="px-4 py-3">Image</th>
                <th className="px-4 py-3">Link</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900">
              {rows.map((row) => (
                <tr key={row.id} className="text-sm">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-100">
                      {row.heading ?? "FEATURED"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {row.subheading ?? "Live promotion"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={row.image_url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-sky-300 hover:underline"
                    >
                      {row.image_url}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    {row.target_url ? (
                      <a
                        href={row.target_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-slate-300 hover:underline"
                      >
                        {row.target_url}
                      </a>
                    ) : (
                      <span className="text-xs text-slate-500">No link</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">{row.priority}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        row.is_active
                          ? "bg-emerald-900/40 text-emerald-300"
                          : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      {row.is_active ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => startEdit(row)}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                      >
                        Edit
                      </button>
                      {row.is_active ? (
                        <button
                          onClick={() => setActive(row.id, false)}
                          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => setActive(row.id, true)}
                          className="rounded-md bg-sky-500 px-2 py-1 text-xs font-medium text-slate-950 hover:bg-sky-400"
                        >
                          Activate
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteBannerId(row.id)}
                        className="rounded-md bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-500"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={deleteBannerId !== null}
        title="Delete banner"
        message="Delete this banner permanently? This cannot be undone."
        confirmLabel="Delete"
        danger
        busy={deletingBanner}
        onCancel={() => setDeleteBannerId(null)}
        onConfirm={async () => {
          if (!deleteBannerId) return;
          const id = deleteBannerId;
          setDeleteBannerId(null);
          await runDeleteBanner(id);
        }}
      />
    </div>
  );
}
