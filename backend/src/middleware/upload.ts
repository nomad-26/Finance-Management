import multer from 'multer';
import { Request } from 'express';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf'
];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const storage = multer.memoryStorage();

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const mimeType = file.mimetype.toLowerCase();
  const ext = file.originalname.split('.').pop()?.toLowerCase();

  const isMimeValid = ALLOWED_MIME_TYPES.includes(mimeType);
  const isExtValid = ['jpg', 'jpeg', 'png', 'pdf'].includes(ext || '');

  if (isMimeValid || isExtValid) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type "${file.originalname}". Only JPG, JPEG, PNG, and PDF files up to 10MB are allowed.`
      )
    );
  }
};

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES
  },
  fileFilter
});
