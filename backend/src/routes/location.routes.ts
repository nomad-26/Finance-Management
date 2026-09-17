import { Router } from 'express';
import { resolveLocationLink } from '../controllers/location.controller.js';

const router = Router();

router.post('/resolve-link', resolveLocationLink);

export default router;
