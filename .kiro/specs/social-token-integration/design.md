# Design Document - Social Token Integration

## Overview

This design document outlines the technical architecture for integrating social platform authentication, tokens, and social features into MUSD-based dApps. The solution enables users to authenticate with social accounts, use social platform currencies (Meta, Twitter/X, Discord), share achievements, and participate in community-driven markets.

### Key Design Principles

1. **OAuth 2.0 Integration**: Secure social login via industry-standard OAuth
2. **Token Abstraction**: Unified interface for different social platform tokens
3. **Privacy First**: User control over data sharing and social features
4. **Viral Growth**: Built-in referral and sharing mechanisms
5. **Community Focus**: Support for Discord communities and custom markets
6. **Compliance**: Adherence to all social platform policies

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User (dApp)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Social Login │  │ Social Share │  │  Reputation  │ │
│  │   Buttons    │  │   Widget     │  │   Display    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└────────┬────────────────────┬────────────────┬─────────┘
         │                    │                 │
         ▼                    ▼                 ▼
┌─────────────────────────────────────────────────────────┐
│              Social Integration Service                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   OAuth      │  │   Token      │  │   Social     │ │
│  │   Manager    │  │   Converter  │  │   Graph      │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Reputation  │  │   Referral   │  │  Community   │ │
│  │   System     │  │   Tracker    │  │   Markets    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└────────┬────────────────────┬────────────────┬─────────┘
         │                    │                 │
         ▼                    ▼                 ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Social     │    │   Database   │    │  Blockchain  │
│  Platform    │    │ (PostgreSQL) │    │    (Mezo)    │
│    APIs      │    │              │    │              │
│ - Facebook   │    │              │    │  - MUSD      │
│ - Twitter    │    │              │    │  - Wallet    │
│ - Discord    │    │              │    │              │
└──────────────┘    └──────────────┘    └──────────────┘
```

### Component Interaction Flows

#### Flow 1: Social Login and Wallet Creation

```
User clicks "Login with Facebook/Twitter/Discord"
  ↓
dApp redirects to OAuth provider
  ↓
User authorizes application
  ↓
OAuth provider redirects back with authorization code
  ↓
Backend exchanges code for access token
  ↓
Backend fetches user profile (ID, email, name)
  ↓
Check if user exists in database
  ↓
If new user:
  - Generate new wallet address
  - Create user record
  - Link social account
If existing user:
  - Link additional social account (if not already linked)
  ↓
Generate JWT session token
  ↓
Return to dApp with session token and wallet address
```

#### Flow 2: Social Token Deposit (Meta/Twitter/Discord → MUSD)

```
User selects "Deposit with Meta Credits"
  ↓
Backend fetches current conversion rate
  ↓
User confirms amount and rate
  ↓
Backend initiates social platform payment
  ↓
Social platform processes payment
  ↓
Webhook confirms payment success
  ↓
Backend calculates MUSD amount (after fees)
  ↓
Backend uses Stripe Onramp or direct purchase to acquire MUSD
  ↓
MUSD credited to user's wallet
  ↓
Transaction recorded in database
```

#### Flow 3: Social Sharing with Referral

```
User wins a prediction
  ↓
dApp shows "Share your win" prompt
  ↓
User clicks share button
  ↓
Backend generates share card with:
  - Prediction details
  - Win amount
  - User stats
  - Referral link with user's referral code
  ↓
User shares to Facebook/Twitter/Discord
  ↓
Friend clicks referral link
  ↓
Friend signs up via social login
  ↓
Referral system credits original user with 5 MUSD
  ↓
Friend makes first trade
  ↓
Referral system credits original user with 2% of volume
```

## Components and Interfaces

### 1. OAuth Manager (Backend)

**Technology Stack**: Node.js/TypeScript, Passport.js

**Responsibilities**:
- Handle OAuth 2.0 flows for Facebook, Twitter, Discord
- Exchange authorization codes for access tokens
- Fetch user profiles from social platforms
- Manage token refresh and expiration
- Link multiple social accounts to single wallet

**OAuth Configuration**:

```typescript
interface OAuthConfig {
  facebook: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    scope: ['public_profile', 'email'];
  };
  twitter: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    scope: ['tweet.read', 'users.read'];
  };
  discord: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    scope: ['identify', 'email', 'guilds'];
  };
}
```

**API Endpoints**:

```typescript
// OAuth endpoints
GET    /api/v1/auth/:provider/login
  Redirects to OAuth provider

GET    /api/v1/auth/:provider/callback
  Handles OAuth callback
  Returns: { token: string, user: User, wallet: string }

POST   /api/v1/auth/link/:provider
  Links additional social account
  Headers: { Authorization: 'Bearer <token>' }
  Returns: { success: boolean, linkedAccounts: string[] }

GET    /api/v1/auth/me
  Returns current user info
  Headers: { Authorization: 'Bearer <token>' }
  Returns: { user: User, linkedAccounts: SocialAccount[] }

POST   /api/v1/auth/logout
  Invalidates session token
  Returns: { success: boolean }
```

### 2. Token Converter Service (Backend)

**Responsibilities**:
- Fetch conversion rates from social platforms
- Convert social tokens to MUSD
- Handle deposits and withdrawals
- Apply platform fees
- Cache rates for performance

**Supported Token Types**:

```typescript
enum SocialTokenType {
  META_CREDITS = 'meta_credits',
  TWITTER_TIPS = 'twitter_tips',
  DISCORD_COINS = 'discord_coins',
}

interface TokenConversion {
  sourceToken: SocialTokenType;
  sourceAmount: number;
  destinationToken: 'MUSD';
  destinationAmount: number;
  exchangeRate: number;
  platformFee: number;
  netAmount: number;
  expiresAt: Date;
}
```

**API Endpoints**:

```typescript
// Token conversion endpoints
GET    /api/v1/tokens/rates
  Query: { from: SocialTokenType, to: 'MUSD' }
  Returns: { rate: number, lastUpdated: Date }

POST   /api/v1/tokens/deposit
  Body: { 
    tokenType: SocialTokenType,
    amount: number,
    walletAddress: string
  }
  Returns: { 
    transactionId: string,
    musdAmount: number,
    status: 'pending' | 'completed'
  }

POST   /api/v1/tokens/withdraw
  Body: { 
    tokenType: SocialTokenType,
    musdAmount: number,
    destinationAccount: string
  }
  Returns: { 
    transactionId: string,
    tokenAmount: number,
    status: 'pending' | 'completed'
  }

GET    /api/v1/tokens/history
  Query: { page: number, limit: number }
  Returns: { transactions: TokenTransaction[], total: number }
```

### 3. Social Graph Service (Backend)

**Responsibilities**:
- Import friend lists from social platforms
- Track user follows and connections
- Generate activity feeds
- Manage privacy settings
- Create leaderboards

**API Endpoints**:

```typescript
// Social graph endpoints
GET    /api/v1/social/friends
  Query: { provider?: 'facebook' | 'twitter' | 'discord' }
  Returns: { friends: Friend[], total: number }

POST   /api/v1/social/follow/:userId
  Returns: { success: boolean, following: boolean }

GET    /api/v1/social/feed
  Query: { page: number, limit: number }
  Returns: { activities: Activity[], hasMore: boolean }

GET    /api/v1/social/leaderboard
  Query: { 
    scope: 'global' | 'friends' | 'community',
    metric: 'accuracy' | 'volume' | 'wins',
    period: 'day' | 'week' | 'month' | 'all'
  }
  Returns: { rankings: Ranking[], userRank: number }

PUT    /api/v1/social/privacy
  Body: { 
    profileVisibility: 'public' | 'friends' | 'private',
    showPredictions: boolean,
    showStats: boolean
  }
  Returns: { success: boolean }
```

### 4. Reputation System (Backend)

**Responsibilities**:
- Calculate user accuracy scores
- Track trading volume and participation
- Generate badges and achievements
- Create shareable reputation cards
- Maintain historical stats

**Reputation Metrics**:

```typescript
interface ReputationMetrics {
  userId: string;
  accuracy: number;  // Percentage of correct predictions
  totalPredictions: number;
  correctPredictions: number;
  totalVolume: number;  // Total MUSD traded
  marketsParticipated: number;
  winStreak: number;
  badges: Badge[];
  rank: 'Novice' | 'Intermediate' | 'Expert' | 'Master';
  createdAt: Date;
  updatedAt: Date;
}

interface Badge {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  earnedAt: Date;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}
```

**API Endpoints**:

```typescript
// Reputation endpoints
GET    /api/v1/reputation/:userId
  Returns: { metrics: ReputationMetrics }

GET    /api/v1/reputation/:userId/badges
  Returns: { badges: Badge[] }

GET    /api/v1/reputation/:userId/card
  Returns: PNG image of shareable reputation card

POST   /api/v1/reputation/claim-badge/:badgeId
  Returns: { success: boolean, badge: Badge }
```

### 5. Referral System (Backend)

**Responsibilities**:
- Generate unique referral codes
- Track referral clicks and signups
- Credit referral rewards
- Enforce earning caps
- Generate referral analytics

**Referral Structure**:

```typescript
interface Referral {
  id: string;
  referrerId: string;
  referredUserId: string;
  referralCode: string;
  signupReward: number;  // 5 MUSD
  tradeReward: number;   // 2% of first trade
  status: 'pending' | 'completed';
  createdAt: Date;
  completedAt?: Date;
}

interface ReferralStats {
  userId: string;
  referralCode: string;
  totalClicks: number;
  totalSignups: number;
  totalEarnings: number;
  monthlyEarnings: number;
  earningsCap: number;  // $1,000/month
  topReferrals: Referral[];
}
```

**API Endpoints**:

```typescript
// Referral endpoints
GET    /api/v1/referrals/code
  Returns: { code: string, shareUrl: string }

GET    /api/v1/referrals/stats
  Returns: { stats: ReferralStats }

GET    /api/v1/referrals/history
  Query: { page: number, limit: number }
  Returns: { referrals: Referral[], total: number }
```

### 6. Social Share Service (Backend)

**Responsibilities**:
- Generate shareable content cards
- Create Open Graph meta tags
- Generate referral links
- Track share analytics
- Support multiple platforms

**Share Card Generation**:

```typescript
interface ShareCard {
  type: 'prediction' | 'win' | 'achievement' | 'reputation';
  title: string;
  description: string;
  imageUrl: string;
  shareUrl: string;
  referralCode: string;
  metadata: {
    predictionDetails?: object;
    winAmount?: number;
    badge?: Badge;
    stats?: ReputationMetrics;
  };
}
```

**API Endpoints**:

```typescript
// Social share endpoints
POST   /api/v1/share/generate
  Body: { 
    type: 'prediction' | 'win' | 'achievement',
    data: object
  }
  Returns: { 
    card: ShareCard,
    platforms: {
      facebook: string,
      twitter: string,
      discord: string,
      telegram: string
    }
  }

GET    /api/v1/share/:shareId
  Returns: HTML page with Open Graph tags for social preview

POST   /api/v1/share/track
  Body: { shareId: string, platform: string }
  Returns: { success: boolean }
```

### 7. Community Markets Service (Backend)

**Responsibilities**:
- Allow Discord admins to create custom markets
- Restrict market visibility to community members
- Support community-specific tokens
- Handle market resolution
- Collect platform fees

**API Endpoints**:

```typescript
// Community markets endpoints
POST   /api/v1/communities/:communityId/markets
  Body: { 
    title: string,
    description: string,
    outcomes: string[],
    resolutionDate: Date,
    tokenType: SocialTokenType
  }
  Headers: { Authorization: 'Bearer <admin_token>' }
  Returns: { market: Market }

GET    /api/v1/communities/:communityId/markets
  Returns: { markets: Market[] }

POST   /api/v1/communities/:communityId/markets/:marketId/resolve
  Body: { outcome: string }
  Headers: { Authorization: 'Bearer <admin_token>' }
  Returns: { success: boolean }

GET    /api/v1/communities/:communityId/members
  Returns: { members: User[], total: number }
```

## Data Models

### User Model

```typescript
interface User {
  id: string;
  walletAddress: string;
  email?: string;
  username?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Social Account Model

```typescript
interface SocialAccount {
  id: string;
  userId: string;
  provider: 'facebook' | 'twitter' | 'discord';
  providerId: string;
  providerUsername: string;
  accessToken: string;  // Encrypted
  refreshToken?: string;  // Encrypted
  tokenExpiresAt?: Date;
  linkedAt: Date;
}
```

### Token Transaction Model

```typescript
interface TokenTransaction {
  id: string;
  userId: string;
  type: 'deposit' | 'withdrawal';
  sourceToken: SocialTokenType;
  sourceAmount: number;
  destinationToken: 'MUSD';
  destinationAmount: number;
  exchangeRate: number;
  platformFee: number;
  status: 'pending' | 'completed' | 'failed';
  externalTxId?: string;
  createdAt: Date;
  completedAt?: Date;
}
```

## Database Schema

```sql
-- Users table (extends existing)
ALTER TABLE users ADD COLUMN username VARCHAR(255);
ALTER TABLE users ADD COLUMN profile_image_url VARCHAR(500);

-- Social accounts table
CREATE TABLE social_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,
    provider_id VARCHAR(255) NOT NULL,
    provider_username VARCHAR(255),
    access_token TEXT NOT NULL,  -- Encrypted
    refresh_token TEXT,  -- Encrypted
    token_expires_at TIMESTAMP,
    linked_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(provider, provider_id)
);

CREATE INDEX idx_social_accounts_user_id ON social_accounts(user_id);
CREATE INDEX idx_social_accounts_provider ON social_accounts(provider, provider_id);

-- Token transactions table
CREATE TABLE token_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    type VARCHAR(20) NOT NULL,
    source_token VARCHAR(50) NOT NULL,
    source_amount DECIMAL(18, 6) NOT NULL,
    destination_token VARCHAR(10) DEFAULT 'MUSD',
    destination_amount DECIMAL(18, 6) NOT NULL,
    exchange_rate DECIMAL(18, 8) NOT NULL,
    platform_fee DECIMAL(18, 6) NOT NULL,
    status VARCHAR(20) NOT NULL,
    external_tx_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE INDEX idx_token_transactions_user_id ON token_transactions(user_id);
CREATE INDEX idx_token_transactions_status ON token_transactions(status);

-- Reputation metrics table
CREATE TABLE reputation_metrics (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    accuracy DECIMAL(5, 2) DEFAULT 0,
    total_predictions INT DEFAULT 0,
    correct_predictions INT DEFAULT 0,
    total_volume DECIMAL(18, 6) DEFAULT 0,
    markets_participated INT DEFAULT 0,
    win_streak INT DEFAULT 0,
    rank VARCHAR(20) DEFAULT 'Novice',
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Badges table
CREATE TABLE badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    image_url VARCHAR(500),
    rarity VARCHAR(20) NOT NULL,
    criteria JSONB NOT NULL
);

-- User badges table
CREATE TABLE user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    badge_id UUID REFERENCES badges(id),
    earned_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, badge_id)
);

-- Referrals table
CREATE TABLE referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID REFERENCES users(id),
    referred_user_id UUID REFERENCES users(id),
    referral_code VARCHAR(20) NOT NULL,
    signup_reward DECIMAL(18, 6) DEFAULT 5,
    trade_reward DECIMAL(18, 6) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE INDEX idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX idx_referrals_code ON referrals(referral_code);

-- Social follows table
CREATE TABLE social_follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(follower_id, following_id)
);

CREATE INDEX idx_social_follows_follower ON social_follows(follower_id);
CREATE INDEX idx_social_follows_following ON social_follows(following_id);

-- Community markets table
CREATE TABLE community_markets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id VARCHAR(255) NOT NULL,
    community_type VARCHAR(20) NOT NULL,  -- 'discord', 'telegram'
    creator_id UUID REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    outcomes JSONB NOT NULL,
    resolution_date TIMESTAMP,
    resolved_outcome VARCHAR(255),
    token_type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP
);

CREATE INDEX idx_community_markets_community ON community_markets(community_id);
CREATE INDEX idx_community_markets_status ON community_markets(status);

-- Share analytics table
CREATE TABLE share_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    share_type VARCHAR(50) NOT NULL,
    platform VARCHAR(20) NOT NULL,
    share_url VARCHAR(500),
    clicks INT DEFAULT 0,
    conversions INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_share_analytics_user_id ON share_analytics(user_id);
```

## Frontend Integration

### Social Login Buttons

```typescript
import { useSocialAuth } from '@/hooks/useSocialAuth';

const SocialLoginButtons: React.FC = () => {
  const { login, loading } = useSocialAuth();
  
  return (
    <div className="social-login">
      <button onClick={() => login('facebook')}>
        <FacebookIcon /> Continue with Facebook
      </button>
      <button onClick={() => login('twitter')}>
        <TwitterIcon /> Continue with Twitter
      </button>
      <button onClick={() => login('discord')}>
        <DiscordIcon /> Continue with Discord
      </button>
    </div>
  );
};
```

### Social Share Widget

```typescript
import { useSocialShare } from '@/hooks/useSocialShare';

interface ShareWidgetProps {
  type: 'prediction' | 'win' | 'achievement';
  data: any;
}

const ShareWidget: React.FC<ShareWidgetProps> = ({ type, data }) => {
  const { generateShare, share, loading } = useSocialShare();
  
  const handleShare = async (platform: string) => {
    const shareData = await generateShare(type, data);
    await share(platform, shareData);
  };
  
  return (
    <div className="share-widget">
      <h3>Share your {type}!</h3>
      <div className="share-buttons">
        <button onClick={() => handleShare('facebook')}>
          <FacebookIcon /> Share
        </button>
        <button onClick={() => handleShare('twitter')}>
          <TwitterIcon /> Tweet
        </button>
        <button onClick={() => handleShare('discord')}>
          <DiscordIcon /> Post
        </button>
      </div>
    </div>
  );
};
```

### Reputation Display

```typescript
import { useReputation } from '@/hooks/useReputation';

const ReputationCard: React.FC<{ userId: string }> = ({ userId }) => {
  const { metrics, badges, loading } = useReputation(userId);
  
  if (loading) return <Spinner />;
  
  return (
    <div className="reputation-card">
      <div className="rank">{metrics.rank}</div>
      <div className="accuracy">{metrics.accuracy}% Accurate</div>
      <div className="stats">
        <span>{metrics.totalPredictions} Predictions</span>
        <span>${metrics.totalVolume} Volume</span>
      </div>
      <div className="badges">
        {badges.map(badge => (
          <img key={badge.id} src={badge.imageUrl} alt={badge.name} />
        ))}
      </div>
    </div>
  );
};
```

## Security Considerations

### OAuth Security
- Use PKCE (Proof Key for Code Exchange) for mobile apps
- Store access tokens encrypted in database
- Implement token refresh logic
- Validate redirect URIs
- Use state parameter to prevent CSRF

### Social Token Security
- Validate all social platform webhooks
- Implement rate limiting on token conversions
- Monitor for suspicious conversion patterns
- Enforce minimum/maximum conversion amounts
- Log all token transactions for audit

### Privacy Protection
- Allow users to control data sharing
- Implement granular privacy settings
- Don't share predictions without consent
- Anonymize leaderboards if requested
- Comply with GDPR/CCPA

## Compliance

### Platform Policies

**Facebook/Meta**:
- Comply with Platform Policy
- Follow Monetization Policy
- Implement proper data deletion
- Display required permissions clearly

**Twitter/X**:
- Follow Developer Agreement
- Respect rate limits
- Display Twitter branding correctly
- Handle user data appropriately

**Discord**:
- Follow Terms of Service
- Respect bot rate limits
- Don't spam communities
- Implement proper permissions

### Age Verification
- Require 18+ for real money trading
- Implement age gate on signup
- Verify age through social platforms when possible

## Testing Strategy

### OAuth Testing
- Test login flow for each provider
- Test account linking
- Test token refresh
- Test error scenarios (denied permissions, expired tokens)

### Token Conversion Testing
- Test rate fetching and caching
- Test deposit and withdrawal flows
- Test fee calculations
- Test conversion limits

### Social Features Testing
- Test friend import
- Test sharing functionality
- Test referral tracking
- Test reputation calculations

## Conclusion

This design provides a comprehensive social integration for MUSD-based dApps, enabling:
- ✅ Easy onboarding via social login
- ✅ Social token deposits and withdrawals
- ✅ Viral growth through sharing and referrals
- ✅ Community engagement via reputation and leaderboards
- ✅ Discord community markets
- ✅ Full compliance with platform policies

The architecture is modular, allowing features to be implemented incrementally while maintaining a cohesive user experience.
