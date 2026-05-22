import { useEffect, useRef, useState } from "react";
import EmojiPicker, { Categories } from "emoji-picker-react";

const categoryLabels = [
  { category: Categories.SUGGESTED, name: "Recentes" },
  { category: Categories.SMILEYS_PEOPLE, name: "Carinhas e pessoas" },
  { category: Categories.ANIMALS_NATURE, name: "Animais e natureza" },
  { category: Categories.FOOD_DRINK, name: "Comida e bebida" },
  { category: Categories.TRAVEL_PLACES, name: "Viagem e lugares" },
  { category: Categories.ACTIVITIES, name: "Atividades" },
  { category: Categories.OBJECTS, name: "Objetos" },
  { category: Categories.SYMBOLS, name: "Símbolos" },
  { category: Categories.FLAGS, name: "Bandeiras" },
];

function ArticleEmojiPicker({ open, onClose, onSelect }) {
  const wrapperRef = useRef(null);
  const [position, setPosition] = useState({ left: "50%", top: 0 });

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      const clickedEmojiToolbarButton = event.target.closest?.(".ql-emoji");

      if (!clickedEmojiToolbarButton && !wrapperRef.current?.contains(event.target)) {
        onClose();
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const emojiButton = document.querySelector(".ql-emoji");
      const editorWrap = emojiButton?.closest(".editor-wrap");
      const buttonRect = emojiButton?.getBoundingClientRect();
      const wrapRect = editorWrap?.getBoundingClientRect();

      if (!buttonRect || !wrapRect) {
        setPosition({ left: "50%", top: 0 });
        return;
      }

      setPosition({
        left: buttonRect.left - wrapRect.left + buttonRect.width / 2,
        top: buttonRect.top - wrapRect.top,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [open]);

  const handleEmojiClick = (emojiData) => {
    if (emojiData?.emoji) {
      onSelect(emojiData.emoji);
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div className="emoji-picker-shell" ref={wrapperRef} style={position}>
      <div className="emoji-picker-popover">
        <EmojiPicker
          onEmojiClick={handleEmojiClick}
          autoFocusSearch
          categories={categoryLabels}
          lazyLoadEmojis
          searchPlaceholder="Buscar emoji"
          searchClearButtonLabel="Limpar busca"
          previewConfig={{ showPreview: false }}
          width="100%"
          height={380}
        />
      </div>
    </div>
  );
}

export default ArticleEmojiPicker;
