function ParticipantAvatar({ name, photoUrl, className = "" }) {
  const initial = name?.trim().charAt(0).toLocaleUpperCase("pt-BR") || "?";

  if (photoUrl) {
    return <img src={photoUrl} alt="" className={className} />;
  }

  return (
    <span className={`${className} participant-avatar--fallback`} aria-hidden="true">
      {initial}
    </span>
  );
}

export default ParticipantAvatar;
