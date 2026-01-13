// backend/src/lib/alerts.ts
import prisma from '../prisma';
import { AlertKind, AlertSeverity, LoginEvent } from '@prisma/client';

const MAX_KMH = Number(process.env.ALERT_IMPOSSIBLE_TRAVEL_KMH || 900);  // ~airliner
const MIN_DISTANCE_KM = Number(process.env.ALERT_MIN_DISTANCE_KM || 50); // ignore tiny hops

function toRad(d: number) { return (d * Math.PI) / 180; }
function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export async function recordAlertsForLogin(le: LoginEvent) {
  const alerts: Array<Parameters<typeof prisma.securityAlert.create>[0]['data']> = [];

  const whereUser = le.userId ? { userId: le.userId } : { email: le.email ?? undefined };
  const prev = await prisma.loginEvent.findFirst({
    where: { ...(whereUser as any), success: true, id: { lt: le.id } },
    orderBy: { createdAt: 'desc' },
  });

  // NEW_DEVICE
  if (le.userId && le.deviceId) {
    const kd = await prisma.knownDevice.findUnique({
      where: { known_devices_user_device_uniq: { userId: le.userId, deviceId: le.deviceId } },
      select: { deviceId: true },
    });
    if (!kd) {
      alerts.push({
        kind: AlertKind.NEW_DEVICE,
        severity: AlertSeverity.medium,
        userId: le.userId,
        email: le.email ?? undefined,
        ip: le.ip,
        country: le.country, region: le.region, city: le.city,
        deviceId: le.deviceId,
        loginEventId: le.id,
        details: { message: 'First time we see this device for this user.' },
      });
    }
  }

  // NEW_COUNTRY (compare with last successful login)
  if (le.userId && le.success && le.country && prev?.country && le.country !== prev.country) {
    alerts.push({
      kind: AlertKind.NEW_COUNTRY,
      severity: AlertSeverity.medium,
      userId: le.userId,
      email: le.email ?? undefined,
      ip: le.ip,
      country: le.country, region: le.region, city: le.city,
      deviceId: le.deviceId ?? undefined,
      loginEventId: le.id,
      details: { from: prev.country, to: le.country },
    });
  }

  // IMPOSSIBLE_TRAVEL
  if (
    le.userId && le.success &&
    prev?.lat != null && prev?.lon != null &&
    le.lat != null && le.lon != null
  ) {
    const distKm = haversineKm({ lat: prev.lat!, lon: prev.lon! }, { lat: le.lat!, lon: le.lon! });
    const hours = (le.createdAt.getTime() - prev.createdAt.getTime()) / 3_600_000;
    if (hours > 0) {
      const kmh = distKm / hours;
      if (distKm >= MIN_DISTANCE_KM && kmh > MAX_KMH) {
        alerts.push({
          kind: AlertKind.IMPOSSIBLE_TRAVEL,
          severity: AlertSeverity.high,
          userId: le.userId,
          email: le.email ?? undefined,
          ip: le.ip,
          country: le.country, region: le.region, city: le.city,
          deviceId: le.deviceId ?? undefined,
          loginEventId: le.id,
          details: { distKm: Math.round(distKm), hours: +hours.toFixed(2), kmh: Math.round(kmh) },
        });
      }
    }
  }

  if (alerts.length) await prisma.securityAlert.createMany({ data: alerts });
}
