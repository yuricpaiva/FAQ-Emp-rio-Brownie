import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import api from "../../services/api";
import { photoUrl } from "../../utils/forms";

function FormCameraCapture({ submissionId, answer, disabled, onSaved, triggerOnly = false }) {
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const streamRef = useRef(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [candidate, setCandidate] = useState(null);
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null; setCameraOpen(false);
  };

  const discardCandidate = () => {
    setCandidate(null);
    setPreview((currentPreview) => { if (currentPreview) URL.revokeObjectURL(currentPreview); return ""; });
  };

  const closeModal = (force = false) => {
    if (uploading && !force) return;
    stopCamera(); discardCandidate(); setPreparing(false); setError(""); setModalOpen(false);
  };

  useEffect(() => () => { streamRef.current?.getTracks().forEach((track) => track.stop()); }, []);
  useEffect(() => {
    if (!modalOpen) return undefined;
    const escape = (event) => { if (event.key === "Escape") closeModal(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [modalOpen, uploading]);

  const setFile = (file) => {
    if (!file) return;
    discardCandidate(); setModalOpen(true); setCandidate(file); setPreview(URL.createObjectURL(file)); setPreparing(false); setError(""); stopCamera();
  };

  const openCamera = async () => {
    setModalOpen(true); setPreparing(true); setError(""); discardCandidate(); stopCamera();
    if (fileRef.current) fileRef.current.value = "";
    if (!navigator.mediaDevices?.getUserMedia) { setPreparing(false); fileRef.current?.click(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream; setCameraOpen(true); setPreparing(false);
      window.setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); } }, 0);
    } catch { setPreparing(false); fileRef.current?.click(); }
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
      onSaved(response.data); closeModal(true);
    } catch (uploadError) { setError(uploadError.response?.data?.error || "Não foi possível salvar a foto."); }
    finally { setUploading(false); }
  };

  if (disabled) return answer.photo ? <img className="forms-photo-preview" src={photoUrl(answer.photo.id)} alt={`Evidência de ${answer.text}`} /> : <span className="forms-muted">Sem evidência fotográfica.</span>;
  return <div className={`forms-camera ${triggerOnly ? "forms-camera--trigger" : ""}`}>
    {triggerOnly ? <button type="button" className={`forms-observation-trigger forms-photo-trigger ${answer.photo ? "has-photo" : ""}`} onClick={openCamera} aria-label={answer.photo ? "Refazer registro fotográfico" : "Adicionar registro fotográfico"} title={answer.photo ? "Refazer registro fotográfico" : "Adicionar registro fotográfico"}><Camera size={18} aria-hidden="true" />{answer.photo && <span aria-hidden="true" />}</button> : <>
      {answer.photo && <><img className="forms-photo-preview" src={photoUrl(answer.photo.id)} alt={`Evidência de ${answer.text}`} /><span className="forms-upload-success">Foto salva.</span></>}
      <button type="button" className="button button--ghost" onClick={openCamera}>{answer.photo ? "Refazer foto" : "Tirar foto"}</button>
    </>}
    <input ref={fileRef} className="forms-camera-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => setFile(event.target.files?.[0])} />
    {modalOpen && <div className="modal-backdrop forms-camera-backdrop" onClick={() => closeModal()}>
      <div className="modal-card forms-camera-modal" role="dialog" aria-modal="true" aria-labelledby={`forms-camera-title-${answer.id}`} onClick={(event) => event.stopPropagation()}>
        <div className="modal-card__header"><div><h3 id={`forms-camera-title-${answer.id}`}>{answer.photo ? "Refazer foto" : "Tirar foto"}</h3><p>Enquadre a evidência e confirme antes de salvar.</p></div><button type="button" onClick={() => closeModal()} disabled={uploading} aria-label="Fechar câmera">×</button></div>
        {preparing && <div className="forms-camera-preparing">Preparando câmera...</div>}
        {cameraOpen && <div className="forms-camera-live"><video ref={videoRef} playsInline muted /><div><button type="button" className="button" onClick={capture}>Capturar foto</button><button type="button" className="button button--ghost" onClick={() => closeModal()}>Cancelar</button></div></div>}
        {preview && <div className="forms-camera-candidate"><img className="forms-photo-preview" src={preview} alt="Prévia da foto capturada" /><div><button type="button" className="button" onClick={upload} disabled={uploading}>{uploading ? `Enviando ${progress}%` : "Usar foto"}</button><button type="button" className="button button--ghost" onClick={openCamera} disabled={uploading}>Refazer foto</button></div></div>}
        {!preparing && !cameraOpen && !preview && <div className="forms-camera-fallback"><p>A câmera não pôde ser aberta automaticamente.</p><button type="button" className="button" onClick={() => fileRef.current?.click()}>Abrir câmera</button></div>}
        {error && <div className="forms-camera-error"><span>{error}</span>{candidate && <button type="button" onClick={upload}>Tentar novamente</button>}</div>}
      </div>
    </div>}
  </div>;
}

export default FormCameraCapture;
