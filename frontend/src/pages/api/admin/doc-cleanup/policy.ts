import type {NextApiRequest, NextApiResponse} from 'next';

type DocPolicy = {
  enabled: boolean;
  delayAmount: number;
  delayUnit: 'days' | 'weeks' | 'months';
  lastRunAt?: string | null;
  lastDeleted?: number | null;
  includeAvatar?: boolean; // new
  includeProfileImage?: boolean; // response compatibility
};

const DEFAULT: DocPolicy = {
  enabled: false,
  delayAmount: 0,
  delayUnit: 'days',
  lastRunAt: null,
  lastDeleted: 0,
  includeAvatar: false, // new
  includeProfileImage: false, // new
};

// simple in-memory store
declare global {
  // eslint-disable-next-line no-var
  var __docCleanupPolicy: DocPolicy | undefined;
}
function getStore(): DocPolicy {
  if (!global.__docCleanupPolicy) global.__docCleanupPolicy = {...DEFAULT};
  return global.__docCleanupPolicy;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const cur = getStore();
    // always mirror both keys
    return res.status(200).json({
      ...cur,
      includeProfileImage: cur.includeAvatar ?? false,
    });
  }

  if (req.method === 'PUT') {
    const cur = getStore();
    const b = (req.body ?? {}) as Partial<DocPolicy> & {
      includeProfileImage?: boolean;
    };

    // normalize avatar flag from either key
    let avatarFlag = cur.includeAvatar ?? false;
    if (typeof b.includeAvatar === 'boolean') avatarFlag = b.includeAvatar;
    if (typeof b.includeProfileImage === 'boolean')
      avatarFlag = b.includeProfileImage;

    const next: DocPolicy = {
      ...cur,
      ...(typeof b.enabled === 'boolean' ? {enabled: b.enabled} : {}),
      ...(Number.isFinite(b.delayAmount)
        ? {
            delayAmount: Math.max(
              0,
              Math.min(30, Math.trunc(Number(b.delayAmount))),
            ),
          }
        : {}),
      ...(b.delayUnit ? {delayUnit: b.delayUnit} : {}),
      includeAvatar: avatarFlag,
      includeProfileImage: avatarFlag,
    };

    global.__docCleanupPolicy = next;
    return res.status(200).json(next);
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({error: 'Method Not Allowed'});
}
