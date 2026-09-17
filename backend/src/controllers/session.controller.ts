import { Request, Response } from 'express';
import { sessionService } from '../services/session.service.js';

export const getSessions = (req: Request, res: Response) => {
  try {
    const sessions = sessionService.listSessions();
    return res.json({ success: true, data: sessions });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const registerSession = (req: Request, res: Response) => {
  try {
    const sessionData = req.body;
    if (!sessionData || !sessionData.sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' });
    }
    const session = sessionService.registerSession(sessionData);
    return res.json({ success: true, data: session });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const revokeSession = (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' });
    }
    const ok = sessionService.revokeSession(sessionId);
    if (!ok) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    return res.json({ success: true, message: `Session ${sessionId} has been revoked successfully.` });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const revokeOtherSessions = (req: Request, res: Response) => {
  try {
    const { currentSessionId } = req.body;
    if (!currentSessionId) {
      return res.status(400).json({ success: false, message: 'currentSessionId is required' });
    }
    const revokedCount = sessionService.revokeOtherSessions(currentSessionId);
    return res.json({
      success: true,
      message: `Successfully revoked ${revokedCount} other active session(s).`,
      revokedCount
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const revokeAllSessions = (req: Request, res: Response) => {
  try {
    const revokedCount = sessionService.revokeAllSessions();
    return res.json({
      success: true,
      message: `Successfully revoked all ${revokedCount} active session(s).`,
      revokedCount
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const checkSessionStatus = (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' });
    }
    const result = sessionService.checkSession(sessionId);
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
