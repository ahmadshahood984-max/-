// Helper to load image for canvas drawing
const loadImageAsync = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
};

export const generateEvaluationCardImage = async (
  studentName: string,
  studentId: string,
  message: string
): Promise<string> => {
  const schoolLogo = localStorage.getItem('school_logo_image') || '';
  const studentPhotoKey = `student_photo_${studentId || studentName}`;
  const studentPhoto = localStorage.getItem(studentPhotoKey) || localStorage.getItem(`student_photo_${studentName}`) || '';

  const canvas = document.createElement('canvas');
  const width = 800;

  // Calculate text wrapping
  const tempCtx = canvas.getContext('2d');
  if (!tempCtx) throw new Error('Canvas not supported');
  tempCtx.font = '500 18px sans-serif';

  const lines: string[] = [];
  const paragraphs = message.split('\n');
  const maxTextWidth = 720;

  paragraphs.forEach(p => {
    if (!p.trim()) {
      lines.push('');
      return;
    }
    const words = p.split(' ');
    let currentLine = '';
    words.forEach(w => {
      const testLine = currentLine ? `${currentLine} ${w}` : w;
      if (tempCtx.measureText(testLine).width > maxTextWidth && currentLine) {
        lines.push(currentLine);
        currentLine = w;
      } else {
        currentLine = testLine;
      }
    });
    if (currentLine) lines.push(currentLine);
  });

  const lineHeight = 28;
  const messageBoxHeight = Math.max(140, lines.length * lineHeight + 50);
  const totalHeight = 360 + messageBoxHeight;

  canvas.width = width;
  canvas.height = totalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context error');

  // Canvas Background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, totalHeight);

  // Card Outer Box
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(16, 16, width - 32, totalHeight - 32, 24);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#047857';
  ctx.stroke();

  // Top Header Gradient Banner
  const grad = ctx.createLinearGradient(0, 20, width, 20);
  grad.addColorStop(0, '#064e3b');
  grad.addColorStop(0.5, '#047857');
  grad.addColorStop(1, '#0f766e');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(24, 24, width - 48, 120, 18);
  ctx.fill();

  // Draw School Logo (Circular)
  if (schoolLogo) {
    try {
      const logoImg = await loadImageAsync(schoolLogo);
      ctx.save();
      ctx.beginPath();
      ctx.arc(84, 84, 38, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(46, 46, 76, 76);
      ctx.drawImage(logoImg, 46, 46, 76, 76);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(84, 84, 38, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#f59e0b';
      ctx.stroke();
    } catch (e) {
      console.warn('Logo image failed to load for canvas render', e);
    }
  }

  // Header Title Text
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fcd34d';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('المدرسة الدولية الخاصة', width - 50, 72);

  ctx.fillStyle = '#ecfdf5';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('بطاقة التقييم والتقرير الشهري 📜', width - 50, 102);

  // Draw Student Photo (Circular)
  if (studentPhoto) {
    try {
      const photoImg = await loadImageAsync(studentPhoto);
      ctx.save();
      ctx.beginPath();
      ctx.arc(width - 90, 84, 38, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(width - 128, 46, 76, 76);
      ctx.drawImage(photoImg, width - 128, 46, 76, 76);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(width - 90, 84, 38, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#f59e0b';
      ctx.stroke();
    } catch (e) {
      console.warn('Student photo failed to load for canvas render', e);
    }
  }

  // Student Info Sub-bar
  ctx.fillStyle = '#f1f5f9';
  ctx.beginPath();
  ctx.roundRect(24, 156, width - 48, 56, 12);
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(`الطالب/ة: ${studentName}`, width - 50, 192);

  ctx.fillStyle = '#047857';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`التاريخ: ${new Date().toLocaleDateString('ar-SA')}`, 50, 192);

  // Message Body Box
  ctx.fillStyle = '#ecfdf5';
  ctx.beginPath();
  ctx.roundRect(24, 226, width - 48, messageBoxHeight, 14);
  ctx.fill();
  ctx.strokeStyle = '#a7f3d0';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.direction = 'rtl';
  ctx.fillStyle = '#064e3b';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('تفاصيل تقرير التقييم الشهري الموجه لولي الأمر:', width - 48, 258);

  ctx.fillStyle = '#1e293b';
  ctx.font = '500 17px sans-serif';
  let lineY = 292;
  lines.forEach(line => {
    ctx.fillText(line, width - 48, lineY);
    lineY += lineHeight;
  });

  // Footer
  const footerY = totalHeight - 40;
  ctx.fillStyle = '#047857';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('صادرة معتمدة من إشراف المدرسة الدولية الخاصة ✓', width - 48, footerY);

  return canvas.toDataURL('image/png');
};

export const shareOrDownloadEvaluationImage = async (
  studentName: string,
  studentId: string,
  message: string
): Promise<{ success: boolean; mode: 'share' | 'download' }> => {
  const dataUrl = await generateEvaluationCardImage(studentName, studentId, message);
  const fileName = `بطاقة_تقييم_${studentName.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('ar-SA').replace(/\//g, '-')}.png`;

  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], fileName, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: `بطاقة تقييم الطالب ${studentName}`,
          text: `تقرير التقييم الشهري للطالب/ة: ${studentName}`,
          files: [file]
        });
        return { success: true, mode: 'share' };
      } catch (err) {
        console.warn('Web Share API was cancelled or unsupported, falling back to direct download:', err);
      }
    }
  } catch (e) {
    console.warn('Error creating file blob for Web Share:', e);
  }

  // Fallback: Direct download link trigger
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  a.click();

  return { success: true, mode: 'download' };
};
