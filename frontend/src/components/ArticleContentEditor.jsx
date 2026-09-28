import { useEffect, useMemo, useRef, useState } from "react";
import ReactQuill, { Quill } from "react-quill";
import ImageResize from "quill-image-resize-module-react";
import "react-quill/dist/quill.snow.css";
import api from "../services/api";
import ArticleEmojiPicker from "./ArticleEmojiPicker";
import ArticleVideoModal from "./ArticleVideoModal";

const BlockEmbed = Quill.import("blots/block/embed");

class ArticleVideoBlot extends BlockEmbed {
  static create(value) {
    const node = super.create();
    node.setAttribute("data-provider", value.provider);
    node.setAttribute("data-video-id", value.id);
    node.setAttribute("contenteditable", "false");

    const frame = document.createElement("div");
    frame.className = "article-video-frame";
    const iframe = document.createElement("iframe");
    iframe.src = value.embedUrl;
    iframe.title = `Vídeo do ${value.provider === "drive" ? "Google Drive" : "YouTube"}`;
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("allowfullscreen", "true");
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
    frame.appendChild(iframe);
    node.appendChild(frame);

    if (value.caption) {
      const caption = document.createElement("figcaption");
      caption.textContent = value.caption;
      node.appendChild(caption);
    }
    return node;
  }

  static value(node) {
    const provider = node.getAttribute("data-provider") || "youtube";
    const id = node.getAttribute("data-video-id") || "";
    return {
      provider,
      id,
      embedUrl: node.querySelector("iframe")?.getAttribute("src") || "",
      caption: node.querySelector("figcaption")?.textContent || ""
    };
  }
}

ArticleVideoBlot.blotName = "articleVideo";
ArticleVideoBlot.tagName = "figure";
ArticleVideoBlot.className = "article-video-embed";

if (!Quill.imports["formats/articleVideo"]) {
  Quill.register(ArticleVideoBlot);
}
if (!Quill.imports["modules/imageResize"]) {
  Quill.register("modules/imageResize", ImageResize);
}

function ArticleContentEditor({ value, onChange, onError, placeholder }) {
  const quillRef = useRef(null);
  const selectionRef = useRef(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [videoEditor, setVideoEditor] = useState(null);

  const handleImageUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      try {
        const response = await api.post("/admin/uploads", formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        const editor = quillRef.current?.getEditor();
        const range = editor.getSelection(true);
        editor.insertEmbed(range.index, "image", response.data.url, "user");
        editor.setSelection(range.index + 1);
      } catch (error) {
        onError(error.response?.data?.error || "Erro ao enviar imagem");
      }
    };
    input.click();
  };

  const openNewVideo = () => {
    const editor = quillRef.current?.getEditor();
    const range = editor?.getSelection() || selectionRef.current;
    setVideoEditor({ index: range?.index ?? Math.max((editor?.getLength() || 1) - 1, 0), value: null });
  };

  const modules = useMemo(() => ({
    toolbar: {
      container: [
        [{ header: [1, 2, 3, false] }],
        ["bold", "italic", "underline", "strike"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["link", "image", "video", "emoji"],
        ["clean"]
      ],
      handlers: {
        image: handleImageUpload,
        video: openNewVideo,
        emoji: () => setEmojiPickerOpen((current) => !current)
      }
    },
    imageResize: { modules: ["Resize", "DisplaySize"] }
  }), []);

  useEffect(() => {
    const editor = quillRef.current?.getEditor();
    const root = editor?.root;
    if (!root) return undefined;
    const openExisting = (event) => {
      const node = event.target.closest?.(".article-video-embed");
      if (!node || !root.contains(node)) return;
      const blot = Quill.find(node);
      setVideoEditor({ index: editor.getIndex(blot), value: ArticleVideoBlot.value(node) });
    };
    root.addEventListener("click", openExisting);
    return () => root.removeEventListener("click", openExisting);
  }, []);

  const handleEmojiSelect = (emoji) => {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;
    const range = editor.getSelection() || selectionRef.current;
    const index = range?.index ?? Math.max(editor.getLength() - 1, 0);
    editor.insertText(index, emoji, "user");
    editor.setSelection(index + emoji.length, 0, "user");
    editor.focus();
  };

  const saveVideo = (video) => {
    const editor = quillRef.current?.getEditor();
    if (!editor || !videoEditor) return;
    if (videoEditor.value) editor.deleteText(videoEditor.index, 1, "user");
    editor.insertEmbed(videoEditor.index, "articleVideo", video, "user");
    editor.insertText(videoEditor.index + 1, "\n", "user");
    editor.setSelection(videoEditor.index + 2, 0, "user");
    setVideoEditor(null);
  };

  const removeVideo = () => {
    const editor = quillRef.current?.getEditor();
    if (editor && videoEditor?.value) editor.deleteText(videoEditor.index, 1, "user");
    setVideoEditor(null);
  };

  return (
    <div className="editor-wrap">
      <div className="editor-shell">
        <ReactQuill
          ref={quillRef}
          theme="snow"
          value={value}
          onChange={onChange}
          onChangeSelection={(range) => { if (range) selectionRef.current = range; }}
          modules={modules}
          placeholder={placeholder}
        />
      </div>
      <ArticleEmojiPicker open={emojiPickerOpen} onClose={() => setEmojiPickerOpen(false)} onSelect={handleEmojiSelect} />
      {videoEditor && (
        <ArticleVideoModal
          initialValue={videoEditor.value ? { url: videoEditor.value.embedUrl, caption: videoEditor.value.caption } : null}
          onClose={() => setVideoEditor(null)}
          onSave={saveVideo}
          onRemove={videoEditor.value ? removeVideo : null}
        />
      )}
    </div>
  );
}

export default ArticleContentEditor;
