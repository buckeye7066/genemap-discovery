import { ForbiddenError } from '../utils/errors.js';

const FREE_TIER_LIMITS = {
  explanations_per_day: 5,
  images_per_day: 2,
  quizzes_per_day: 3,
  chat_messages_per_day: 10,
};

function isAdminUser(user) {
  return user.role === 'admin' || user.role === 'super_admin';
}

export async function checkEducationEntitlement(request, reply) {
  const prisma = request.server.prisma;
  const userId = request.user?.userId;

  if (!userId) {
    throw new ForbiddenError('Authentication required for education features');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscriptions: {
        where: { status: { in: ['active', 'trialing'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!user) {
    throw new ForbiddenError('User not found');
  }

  if (isAdminUser(user)) {
    request.entitlements = {
      isPremium: true,
      isInstitutional: false,
      isAdmin: true,
      tier: 'premium',
      limits: null,
    };
    return;
  }

  const isPremium = user.subscriptions.length > 0;

  let isInstitutional = false;
  try {
    const licenseAssignment = await prisma.licenseAssignment.findFirst({
      where: { userEmail: user.email, status: 'active' },
      include: { license: true },
    });
    if (licenseAssignment?.license?.status === 'active') {
      isInstitutional = true;
    }
  } catch {
    // Table may not exist yet
  }

  request.entitlements = {
    isPremium: isPremium || isInstitutional,
    isInstitutional,
    tier: isPremium || isInstitutional ? 'premium' : 'free',
    limits: isPremium || isInstitutional ? null : FREE_TIER_LIMITS,
  };
}

export async function enforceUsageLimit(request, reply) {
  if (request.entitlements?.isPremium || request.entitlements?.isAdmin) return;

  const prisma = request.server.prisma;
  const userId = request.user.userId;
  const limits = request.entitlements?.limits || FREE_TIER_LIMITS;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const routeUrl = request.url;
  let limitKey = 'explanations_per_day';
  if (routeUrl.includes('/image')) limitKey = 'images_per_day';
  else if (routeUrl.includes('/quiz')) limitKey = 'quizzes_per_day';
  else if (routeUrl.includes('/chat')) limitKey = 'chat_messages_per_day';

  const limit = limits[limitKey] || 5;

  const typeMap = {
    explanations_per_day: 'explanation',
    images_per_day: 'image',
    quizzes_per_day: 'quiz',
    chat_messages_per_day: 'chat',
  };
  const sessionType = typeMap[limitKey] || 'explanation';

  const typeCount = await prisma.learningSession.count({
    where: {
      userId,
      type: sessionType,
      createdAt: { gte: today },
    },
  });

  if (typeCount >= limit) {
    throw new ForbiddenError(
      `Daily limit reached (${limit} ${sessionType}s per day on free tier). Upgrade to Premium for unlimited access.`
    );
  }

  request.usageInfo = {
    used: typeCount,
    limit,
    type: sessionType,
    remaining: limit - typeCount,
  };
}
