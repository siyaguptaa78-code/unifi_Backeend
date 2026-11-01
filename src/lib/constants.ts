/** Core business constants. Runtime-tunable values live in SystemSetting (see settings.service). */
export const MEMBERSHIP_PRICE_INR = 5000;
export const POINTS_PER_RECHARGE = 5000;
export const HOURS_PER_RECHARGE = 150;
export const MINUTES_PER_RECHARGE = HOURS_PER_RECHARGE * 60;
export const POINT_VALUE_INR = 1;

export const DEFAULT_SETTINGS = {
  "membership.price": { value: MEMBERSHIP_PRICE_INR, description: "Membership / recharge price in INR" },
  "membership.points": { value: POINTS_PER_RECHARGE, description: "Points credited per successful recharge" },
  "membership.hours": { value: HOURS_PER_RECHARGE, description: "Membership hours set on each successful recharge" },
  "alerts.lowPointsThreshold": { value: 500, description: "Notify customer when points fall below this value" },
  "alerts.lowHoursThreshold": { value: 10, description: "Notify customer when remaining hours fall below this value" },
  "visits.duplicateTapSeconds": { value: 30, description: "Ignore repeated card taps within this many seconds" },
  "orders.customerCancelStatuses": { value: ["PENDING"], description: "Order statuses in which a customer may self-cancel" },
  "orders.refundPolicy": {
    value: "FULL_REFUND_BEFORE_COMPLETION",
    description: "Cancelled orders (before completion) are refunded in full to the points wallet. PENDING CLIENT APPROVAL.",
  },
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;

