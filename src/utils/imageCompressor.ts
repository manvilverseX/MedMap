export async function compressImageIfNeeded(file: File): Promise<File> {
  const MAX_SIZE_BYTES = 3.5 * 1024 * 1024; // 3.5 MB

  if (!file.type.startsWith('image/') || file.size <= MAX_SIZE_BYTES) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const MAX_DIMENSION = 2048;
      let { width, height } = img;

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return resolve(file);
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            return resolve(file);
          }

          // Use the original filename but change the extension to .jpg
          const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
          
          const newFile = new File([blob], newFileName, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });

          resolve(newFile);
        },
        'image/jpeg',
        0.82
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // Return original if parsing fails
    };

    img.src = objectUrl;
  });
}
