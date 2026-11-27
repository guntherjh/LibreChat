const { createPendoTracker, pendoRouteEvents } = require('@librechat/api');

const host = process.env.PENDO_DATA_HOST;
const key = process.env.PENDO_TRACK_EVENT_SECRET;
const passThrough = (_req, _res, next) => next();

/** Server-side Pendo track events. A no-op unless both variables are set. */
module.exports =
  host && key
    ? createPendoTracker({ host, key, routes: pendoRouteEvents })
    : { enabled: false, track: () => {}, route: () => passThrough };
