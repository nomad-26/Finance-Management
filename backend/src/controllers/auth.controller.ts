import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UserModel, IUser, UserRole, normalizeUserPermissions } from '../models/User.js';
import { sessionService } from '../services/session.service.js';
import { localAuthService } from '../services/localAuth.service.js';
import { firestoreRepository } from '../repositories/firestore.repository.js';

export const login = async (req: Request, res: Response) => {
  const reqStart = Date.now();
  const clientIp = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  try {
    const { identifier: bodyIdentifier, email, username, id, password } = req.body || {};
    const rawIdentifier = (bodyIdentifier || email || username || id || '').trim();
    const identifier = rawIdentifier.toLowerCase();
    const upperIdentifier = rawIdentifier.toUpperCase();

    if (!rawIdentifier || !password) {
      console.warn(`[LOGIN] [${clientIp}] Validation failed: Missing identifier or password`);
      return res.status(400).json({
        success: false,
        error: 'INVALID_INPUT',
        message: 'Email / Staff ID and password are required.'
      });
    }

    console.log(`[LOGIN] [${clientIp}] Request received for: ${rawIdentifier}`);

    // Find user by email, username, staffId, uid, or _id in local store
    let user = localAuthService.findUserByIdentifier(rawIdentifier);

    // If not found in local memory, sync from Cloud Firestore (cross-PC creation)
    if (!user) {
      console.log(`[LOGIN] User not found locally for "${rawIdentifier}". Checking Cloud Firestore...`);
      try {
        await firestoreRepository.syncWithFirestore();
      } catch (syncErr: any) {
        console.warn('[LOGIN] Cloud Firestore sync check notice:', syncErr?.message || syncErr);
      }
      user = localAuthService.findUserByIdentifier(rawIdentifier);
    }

    if (!user) {
      await localAuthService.seedDefaultUsers();
      user = localAuthService.findUserByIdentifier(rawIdentifier);
    }

    if (!user) {
      user = await UserModel.findOne({
        $or: [
          { email: identifier },
          { username: identifier },
          { staffId: upperIdentifier },
          { staffId: identifier },
          { uid: identifier },
          { uid: rawIdentifier },
          { _id: rawIdentifier }
        ]
      });
    } else {
      user = UserModel.wrapUser(user);
    }

    console.log(`[LOGIN] [${clientIp}] Account found: ${Boolean(user)} (${user?.role || 'N/A'})`);

    if (!user) {
      console.warn(`[LOGIN] [${clientIp}] Authentication failed: Account not found for "${rawIdentifier}"`);
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email/staff ID or password.'
      });
    }

    const currentStatus = (user.status || (user.isActive ? 'active' : 'inactive')).toUpperCase();
    console.log(`[LOGIN] [${clientIp}] Account status: ${currentStatus}`);

    // Check account status
    if (!user.isActive || user.status === 'inactive' || (user.status as string) === 'DISABLED') {
      console.warn(`[LOGIN] [${clientIp}] Login denied: Account deactivated for ${user.staffId || user.email}`);
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_DISABLED',
        message: 'Your account has been deactivated. Please contact an Administrator.'
      });
    }

    const hasHash = Boolean(user.passwordHash && typeof user.passwordHash === 'string' && user.passwordHash.trim());

    // Defensive check: verify password hash exists and is a valid bcrypt format
    if (!hasHash) {
      console.error(`[LOGIN] [${clientIp}] Security Alert: User "${user.email || user.staffId}" has no passwordHash.`);
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.'
      });
    }

    // Verify password against stored bcrypt hash safely
    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(password, user.passwordHash);
    } catch (bcryptErr) {
      console.error(`[LOGIN] [${clientIp}] bcrypt.compare error:`, bcryptErr);
    }

    // If password mismatch, check if password was updated on another PC and sync
    if (!isMatch) {
      console.log(`[LOGIN] Initial password check failed. Syncing latest state from Cloud Firestore...`);
      try {
        await firestoreRepository.syncWithFirestore();
        const freshUser = localAuthService.findUserByIdentifier(rawIdentifier);
        if (freshUser && freshUser.passwordHash && freshUser.passwordHash !== user.passwordHash) {
          isMatch = await bcrypt.compare(password, freshUser.passwordHash);
          if (isMatch) {
            user = UserModel.wrapUser(freshUser);
            console.log(`[LOGIN] Password verified successfully against freshly synced credentials!`);
          }
        }
      } catch (freshSyncErr: any) {
        console.warn('[LOGIN] Fresh sync error:', freshSyncErr?.message || freshSyncErr);
      }
    }

    console.log(`[LOGIN] [${clientIp}] Password verification: ${isMatch ? 'SUCCESS' : 'FAILURE'}`);

    if (!isMatch || !user) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email/staff ID or password.'
      });
    }

    // Normalize role
    let normalizedRole: UserRole = 'STAFF';
    const rawRole = (user.role as string || '').toUpperCase();
    if (rawRole === 'ADMIN' || rawRole === 'MASTER_ADMIN') {
      normalizedRole = 'ADMIN';
    } else if (rawRole === 'RENTAL_STAFF') {
      normalizedRole = 'RENTAL_STAFF';
    } else {
      normalizedRole = 'STAFF';
    }

    console.log(`[LOGIN] Role: ${normalizedRole}`);

    // Generate JWT access token
    const payload = {
      sub: (user._id || user.staffId).toString(),
      id: user.staffId || user.uid,
      staffId: user.staffId,
      email: user.email,
      role: normalizedRole
    };

    const token = jwt.sign(payload, env.JWT_SECRET as string, {
      expiresIn: (env.JWT_EXPIRES_IN || '24h') as any
    });

    console.log(`[LOGIN] Session creation: SUCCESS`);

    // Update lastLoginAt while preserving passwordHash
    user.lastLoginAt = new Date().toISOString();
    if (typeof user.save === 'function') {
      await user.save();
    }

    // Register active device session
    const sessionId = `sess_${(user.staffId || 'usr').toLowerCase()}_${Date.now()}`;
    sessionService.registerSession({
      sessionId,
      userId: user.staffId || user.uid,
      userRole: normalizedRole,
      userEmail: user.email,
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      browser: (req.headers['user-agent'] as string) || 'Web Browser',
      status: 'ACTIVE'
    });

    // Safe user payload for frontend (never exposes passwordHash)
    const userJson = user.toJSON ? user.toJSON() : { ...user };
    delete (userJson as any).passwordHash;
    delete (userJson as any).save;

    const normalizedPermissions = normalizeUserPermissions(user.permissions, normalizedRole);

    return res.status(200).json({
      success: true,
      token,
      role: normalizedRole,
      user: {
        ...userJson,
        role: normalizedRole,
        permissions: normalizedPermissions
      },
      message: 'Login successful.'
    });
  } catch (err: any) {
    console.error('[AuthController] Login error:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Unable to sign in right now. Please try again.'
    });
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Not authenticated.'
      });
    }

    const user = await UserModel.findOne({
      $or: [
        { staffId: req.user.id },
        { uid: req.user.id },
        { email: req.user.email }
      ]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'User record not found.'
      });
    }

    let normalizedRole: UserRole = 'STAFF';
    const rawRole = (user.role as string || '').toUpperCase();
    if (rawRole === 'ADMIN' || rawRole === 'MASTER_ADMIN') {
      normalizedRole = 'ADMIN';
    } else if (rawRole === 'RENTAL_STAFF') {
      normalizedRole = 'RENTAL_STAFF';
    } else {
      normalizedRole = 'STAFF';
    }

    const userJson = user.toJSON ? user.toJSON() : { ...user };
    delete (userJson as any).passwordHash;
    delete (userJson as any).save;

    const normalizedPermissions = normalizeUserPermissions(user.permissions, normalizedRole);

    return res.status(200).json({
      success: true,
      user: {
        ...userJson,
        role: normalizedRole,
        permissions: normalizedPermissions
      }
    });
  } catch (err: any) {
    console.error('[AuthController] getMe error:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve user profile.'
    });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required.'
      });
    }

    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INPUT',
        message: 'Both current password and new password are required.'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: 'New password must be at least 6 characters long.'
      });
    }

    const user = await UserModel.findOne({
      $or: [
        { staffId: req.user.id },
        { uid: req.user.id },
        { email: req.user.email }
      ]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'User account not found.'
      });
    }

    if (!user.passwordHash || typeof user.passwordHash !== 'string' || !user.passwordHash.trim()) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CURRENT_PASSWORD',
        message: 'Current password is incorrect.'
      });
    }

    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    } catch {
      isMatch = false;
    }

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CURRENT_PASSWORD',
        message: 'Current password is incorrect.'
      });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = newHash;
    user.mustChangePassword = false;
    user.updatedAt = new Date().toISOString();
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully.'
    });
  } catch (err: any) {
    console.error('[AuthController] changePassword error:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to change password.'
    });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    if (req.user?.id) {
      sessionService.revokeStaffSessions(req.user.id);
    }
    return res.status(200).json({
      success: true,
      message: 'Successfully logged out.'
    });
  } catch (err: any) {
    console.error('[AuthController] logout error:', err);
    return res.status(500).json({
      success: false,
      message: 'Logout completed.'
    });
  }
};

export default { login, getMe, changePassword, logout };
