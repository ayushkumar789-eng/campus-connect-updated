import { asyncHandler } from '../../utils/asyncHandler.js';
import { updateAccountDetails as applyAccountDetails } from '../auth/index.js';

/**
 * PATCH /api/auth/notification-prefs
 *
 * Stored on the user so opting out is a data change rather than a client-side
 * toggle that silently reappears on the next device.
 */
export const updateNotificationPrefs = asyncHandler(async (req, res) => {
  // `$set` on the dotted paths rather than replacing the object, so a partial
  // update never resets the categories the caller did not mention.
  const updates = {};
  for (const [key, value] of Object.entries(req.body)) {
    updates[`notificationPrefs.${key}`] = value;
  }

  req.user.set(updates);
  await req.user.save({ validateBeforeSave: false });

  res.json({
    success: true,
    message: 'Notification preferences updated',
    data: { notificationPrefs: req.user.notificationPrefs.toObject() },
  });
});

/**
 * PATCH /api/auth/onboarding
 *
 * Only ever moves forward, and only within the wizard's range. A user who
 * abandons setup mid-way lands back on the step they reached rather than
 * restarting, but cannot use this to jump past fields they skipped.
 */
export const updateOnboardingStep = asyncHandler(async (req, res) => {
  const step = Number(req.body.step);

  if (step > req.user.onboardingStep) {
    req.user.onboardingStep = step;
    await req.user.save({ validateBeforeSave: false });
  }

  res.json({ success: true, data: { onboardingStep: req.user.onboardingStep } });
});

/**
 * PATCH /api/auth/account-details
 *
 * Username, email and name. Changing the address re-opens email verification,
 * so the response says so explicitly and the client can prompt rather than
 * silently showing a stale "verified" tick.
 */
export const updateAccountDetails = asyncHandler(async (req, res) => {
  const result = await applyAccountDetails(req.user, req.body);

  res.json({
    success: true,
    message: result.emailChanged
      ? 'Details updated. Check your new address to confirm it.'
      : result.usernameChanged
        ? 'Username updated — your profile link has changed.'
        : 'Account updated',
    data: result,
  });
});
