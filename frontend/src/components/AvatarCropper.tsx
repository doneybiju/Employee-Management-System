import {useCallback, useRef, useState} from 'react';
import Cropper from 'react-easy-crop';

type Props = {
  src: string; // data URL
  open: boolean;
  onClose: () => void;
  onCropped: (blob: Blob) => void; // send to server
  circle?: boolean; // round mask
  size?: number; // output size (px)
};

export default function AvatarCropper({
  src,
  open,
  onClose,
  onCropped,
  circle = true,
  size = 512,
}: Props) {
  const [crop, setCrop] = useState({x: 0, y: 0});
  const [zoom, setZoom] = useState(1);
  const areaRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const onCropComplete = useCallback((_area, areaPixels) => {
    areaRef.current = areaPixels;
  }, []);

  async function handleDone() {
    if (!areaRef.current) return;
    const blob = await cropToBlob(src, areaRef.current, size);
    onCropped(blob);
    onClose();
  }

  if (!open) return null;

  return (
    <div style={overlay}>
      <div style={modal}>
        <div
          style={{position: 'relative', width: 'min(92vw, 520px)', height: 420}}
        >
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            cropShape={circle ? 'round' : 'rect'}
            showGrid
            restrictPosition
            objectFit="contain"
          />
        </div>

        <div style={{display: 'grid', gap: 10, marginTop: 12}}>
          <label>
            Zoom{' '}
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={e => setZoom(+e.target.value)}
            />
          </label>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            marginTop: 12,
          }}
        >
          <button onClick={onClose}>Cancel</button>
          <button
            onClick={handleDone}
            style={{
              background: '#1e90ff',
              color: '#fff',
              border: 'none',
              padding: '8px 12px',
              borderRadius: 8,
            }}
          >
            Crop & Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----- helpers ----- */

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,.45)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 1000,
};
const modal: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 16,
  width: 'min(96vw, 560px)',
  boxShadow: '0 10px 30px rgba(0,0,0,.2)',
};

async function cropToBlob(
  imageSrc: string,
  pixelCrop: {x: number; y: number; width: number; height: number},
  outSize: number,
): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = outSize;
  canvas.height = outSize;

  // Draw the selected rect into an intermediate canvas
  const tmp = document.createElement('canvas');
  tmp.width = pixelCrop.width;
  tmp.height = pixelCrop.height;
  const tctx = tmp.getContext('2d')!;
  tctx.drawImage(
    img,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );

  // Scale to final square
  ctx.drawImage(tmp, 0, 0, outSize, outSize);

  // Try WebP then JPEG
  const blob = await toBlob(canvas, 'image/webp', 0.92).catch(() =>
    toBlob(canvas, 'image/jpeg', 0.92),
  );
  return blob;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}
function toBlob(canvas: HTMLCanvasElement, type: string, q?: number) {
  return new Promise<Blob>((res, rej) =>
    canvas.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), type, q),
  );
}
