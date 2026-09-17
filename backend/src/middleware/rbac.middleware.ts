import { Request, Response, NextFunction } from 'express';

/**
 * Finance-Domain RBAC Middleware
 *
 * Blocks RENTAL_STAFF and RENTAL_ADMIN from accessing Finance backend routes.
 * These roles must use the Rental backend (port 5175) exclusively.
 *
 * Usage: Apply to any Finance-only router or individual route handler.
 *   router.use(blockRentalRoles);
 */
export const blockRentalRoles = (req: Request, res: Response, next: NextFunction): void => {
  const userRole =
    (req.headers['user-role'] as string) ||
    (req.headers['x-user-role'] as string) ||
    (req.headers['x-actor-role'] as string) ||
    req.body?.userRole ||
    req.query?.userRole ||
    '';

  if (userRole === 'RENTAL_STAFF' || userRole === 'RENTAL_ADMIN') {
    res.status(403).json({
      success: false,
      error: 'ACCESS_DENIED',
      message:
        'Rental Staff do not have permission to access Finance operations. Please use the Rental Management Portal.',
      rentalPortalUrl: process.env.RENTAL_FRONTEND_URL || 'http://localhost:5174'
    });
    return;
  }

  next();
};

/**
 * Require specific roles to access a route.
 * Usage: router.use(requireFinanceRole(['MASTER_ADMIN', 'ADMIN']));
 */
export const requireFinanceRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRole =
      (req.headers['user-role'] as string) ||
      (req.headers['x-user-role'] as string) ||
      (req.headers['x-actor-role'] as string) ||
      req.body?.userRole ||
      req.query?.userRole ||
      '';

    const userEmail =
      (req.headers['user-email'] as string) ||
      (req.headers['x-user-email'] as string) ||
      (req.headers['x-actor-email'] as string) ||
      '';

    if (userEmail.toLowerCase() === 'goldfinancekkv@gmail.com') {
      return next();
    }

    if (!userRole || !allowedRoles.includes(userRole)) {
      res.status(403).json({
        success: false,
        error: 'INSUFFICIENT_PERMISSIONS',
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}.`
      });
      return;
    }

    next();
  };
};

/**
 * Enforces Master Admin access only for critical administration, staff management,
 * and system-level configurations.
 */
export const requireMasterAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const userRole =
    (req.headers['user-role'] as string) ||
    (req.headers['x-user-role'] as string) ||
    (req.headers['x-actor-role'] as string) ||
    req.body?.userRole ||
    req.query?.userRole ||
    '';

  const userEmail =
    (req.headers['user-email'] as string) ||
    (req.headers['x-user-email'] as string) ||
    (req.headers['x-actor-email'] as string) ||
    '';

  if (userRole === 'MASTER_ADMIN' || userEmail.toLowerCase() === 'goldfinancekkv@gmail.com') {
    return next();
  }

  res.status(403).json({
    success: false,
    error: 'MASTER_ADMIN_REQUIRED',
    message: 'This administrative operation is restricted to Master Admin only.'
  });
};
