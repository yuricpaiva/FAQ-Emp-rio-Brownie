import { useEffect, useRef, useState } from "react";
import api from "../../services/api";
import { photoUrl } from "../../utils/forms";

function FormCameraCapture({ submissionId, answer, disabled, onSaved }) {
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [candidate, setCandidate] = useState(null);
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null; setCameraOpen(false);
  };

  useEffect(() => () => { stopCamera(); if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const setFile = (file) => {
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    setCandidate(file); setPreview(URL.createObjectURL(file)); setError(""); stopCamera();
  };

  const openCamera = async () => {
    setError(""); setCandidate(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview("");
    if (fileRef.current) fileRef.current.value = "";
    if (!navigator.mediaDevices?.getUserMedia) { fileRef.current?.click(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream; setCameraOpen(true);
      window.setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); } }, 0);
    } catch { fileRef.current?.click(); }
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) { setError("A câmera ainda não está pronta."); return; }
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => blob && setFile(new File([blob], "camera.jpg", { type: "image/jpeg" })), "image/jpeg", 0.88);
  };

  const upload = async () => {
    if (!candidate) return;
    setUploading(true); setProgress(0); setError("");
    const data = new FormData(); data.append("photo", candidate);
    try {
      const response = await api.post(`/forms/submissions/${submissionId}/answers/${answer.id}/photo`, data, { headers: { "Content-Type": "multipart/form-data" }, onUploadProgress: (event) => setProgress(event.total ? Math.round((event.loaded / event.total) * 100) : 0) });
      onSaved(response.data); setCandidate(null); if (preview) URL.revokeObjectURL(preview); setPreview("");
    } catch (uploadError) { setError(uploadError.response?.data?.error || "Não foi possível salvar a foto."); }
    finally { setUploading(false); }
  };

  if (disabled) return answer.photo ? <img className="forms-photo-preview" src={photoUrl(answer.photo.id)} alt={`Evidência de ${answer.text}`} /> : <span className="forms-muted">Sem evidência fotográfica.</span>;
  return <div className="forms-camera">
    {answer.photo && !preview && <><img className="forms-photo-preview" src={photoUrl(answer.photo.id)} alt={`Evidência de ${answer.text}`} /><span className="forms-upload-success">Foto salva.</span></>}
    {cameraOpen && <div className="forms-camera-live"><video ref={videoRef} playsInline muted /><button type="button" className="button" onClick={capture}>Capturar</button><button type="button" className="button button--ghost" onClick={stopCamera}>Cancelar</button></div>}
    {preview && <div className="forms-camera-candidate"><img className="forms-photo-preview" src={preview} alt="Prévia da foto capturada" /><div><button type="button" className="button" onClick={upload} disabled={uploading}>{uploading ? `Enviando ${progress}%` : "Usar foto"}</button><button type="button" className="button button--ghost" onClick={openCamera} disabled={uploading}>Refazer foto</button></div></div>}
    {!cameraOpen && !preview && <button type="button" className="button button--ghost" onClick={openCamera}>{answer.photo ? "Refazer foto" : "Tirar foto"}</button>}
    <input ref={fileRef} className="forms-camera-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => setFile(event.target.files?.[0])} />
    {error && <div className="forms-camera-error"><span>{error}</span>{candidate && <button type="button" onClick={upload}>Tentar novamente</button>}</div>}
  </div>;
}

export default FormCameraCapture;
