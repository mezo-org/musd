# Implementation Plan - Social Token Integration

## Overview

This implementation plan breaks down the social token integration into discrete, manageable coding tasks. The plan follows an incremental approach, building from OAuth authentication to complete social features.

## Prerequisites

- OAuth app credentials for Facebook, Twitter, Discord
- Node.js/TypeScript backend with database
- React/TypeScript frontend
- Existing MUSD wallet integration

## Implementation Tasks

- [ ] 1. Set up OAuth infrastructure
  - Install Passport.js and OAuth strategy packages
  - Configure OAuth providers (Facebook, Twitter, Discord)
  - Set up callback URLs and environment variables
  - Create OAuth configuration service
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 1.1 Create social accounts database schema
  - Implement social_accounts table
  - Implement social_follows table
  - Implement share_analytics table
  - Add username and profile_image_url to users table
  - Create database indexes
  - _Requirements: 1.4, 1.5_

- [ ] 2. Implement Facebook OAuth login
  - Create Facebook OAuth strategy with Passport.js
  - Implement /auth/facebook/login endpoint
  - Implement /auth/facebook/callback endpoint
  - Handle wallet creation for new users
  - Handle account linking for existing users
  - Generate JWT session tokens
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 2.1 Build Facebook login frontend
  - Create SocialLoginButton component for Facebook
  - Implement OAuth redirect flow
  - Handle callback and token storage
  - Add error handling for denied permissions
  - Update UI after successful login
  - _Requirements: 1.1, 1.2_

- [ ] 3. Implement Twitter OAuth login
  - Create Twitter OAuth 2.0 strategy
  - Implement /auth/twitter/login endpoint
  - Implement /auth/twitter/callback endpoint
  - Handle wallet creation and linking
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 3.1 Build Twitter login frontend
  - Create SocialLoginButton component for Twitter
  - Implement OAuth flow
  - Handle callback and session
  - _Requirements: 1.1, 1.2_

- [ ] 4. Implement Discord OAuth login
  - Create Discord OAuth strategy
  - Implement /auth/discord/login endpoint
  - Implement /auth/discord/callback endpoint
  - Fetch Discord guilds (servers) user belongs to
  - Handle wallet creation and linking
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 4.1 Build Discord login frontend
  - Create SocialLoginButton component for Discord
  - Implement OAuth flow
  - Handle callback and session
  - _Requirements: 1.1, 1.2_

- [ ] 5. Implement token conversion service
  - Create token rate fetching service
  - Implement rate caching (5-minute TTL)
  - Create conversion calculation logic with fees
  - Build token conversion database models
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 5.1 Create token conversion API endpoints
  - Implement GET /tokens/rates endpoint
  - Implement POST /tokens/deposit endpoint
  - Implement POST /tokens/withdraw endpoint
  - Implement GET /tokens/history endpoint
  - Add validation and error handling
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 6. Integrate Meta token deposits
  - Research and integrate Meta payment API
  - Implement Meta token deposit flow
  - Handle Meta webhooks for payment confirmation
  - Convert Meta credits to MUSD via Stripe or exchange
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 6.1 Build Meta token deposit UI
  - Create deposit form for Meta credits
  - Show conversion rate and fees
  - Implement Meta payment flow
  - Add transaction status tracking
  - _Requirements: 2.1, 2.2, 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 7. Integrate Twitter token deposits
  - Research Twitter Tips/Subscriptions API
  - Implement Twitter token deposit flow
  - Handle Twitter payment webhooks
  - Convert Twitter tokens to MUSD
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ]* 7.1 Build Twitter token deposit UI
  - Create deposit form for Twitter tokens
  - Show conversion rate and fees
  - Implement payment flow
  - _Requirements: 3.1, 3.2, 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 8. Integrate Discord token deposits
  - Integrate with Discord economy bots (MEE6, Dyno)
  - Implement Discord token deposit flow
  - Allow server admins to whitelist tokens
  - Set admin-defined conversion rates
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ]* 8.1 Build Discord token deposit UI
  - Create deposit form for Discord tokens
  - Show conversion rate and fees
  - Implement payment flow
  - _Requirements: 4.1, 4.2, 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 9. Implement reputation system
  - Create reputation_metrics database table
  - Create badges database tables
  - Implement reputation calculation service
  - Calculate accuracy score from prediction results
  - Track total volume and markets participated
  - Implement win streak tracking
  - _Requirements: 7.1, 7.2, 7.3_

- [ ] 9.1 Create reputation API endpoints
  - Implement GET /reputation/:userId endpoint
  - Implement GET /reputation/:userId/badges endpoint
  - Implement POST /reputation/claim-badge/:badgeId endpoint
  - Add reputation update triggers
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 9.2 Build reputation display components
  - Create ReputationCard component
  - Create BadgeDisplay component
  - Create LeaderboardView component
  - Add rank progression visualization
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 10. Implement badge system
  - Define badge criteria (accuracy milestones, volume, streaks)
  - Create badge images and assets
  - Implement automatic badge awarding logic
  - Create badge notification system
  - _Requirements: 7.3, 7.4_

- [ ]* 10.1 Generate shareable reputation cards
  - Implement GET /reputation/:userId/card endpoint
  - Create image generation service (Canvas or similar)
  - Design reputation card template
  - Include user stats, badges, and rank
  - _Requirements: 7.3, 7.4_

- [ ] 11. Implement referral system
  - Create referrals database table
  - Generate unique referral codes for users
  - Implement referral tracking (clicks, signups)
  - Create referral reward logic (5 MUSD signup, 2% first trade)
  - Implement monthly earning cap ($1,000)
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 11.1 Create referral API endpoints
  - Implement GET /referrals/code endpoint
  - Implement GET /referrals/stats endpoint
  - Implement GET /referrals/history endpoint
  - Add referral tracking middleware
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 11.2 Build referral UI components
  - Create ReferralDashboard component
  - Display referral code and share URL
  - Show referral stats (clicks, signups, earnings)
  - Add referral link generator
  - _Requirements: 6.4, 6.5_

- [ ] 12. Implement social sharing features
  - Create share card generation service
  - Implement Open Graph meta tag generation
  - Create shareable URLs with referral codes
  - Design share card templates (prediction, win, achievement)
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 12.1 Create social share API endpoints
  - Implement POST /share/generate endpoint
  - Implement GET /share/:shareId endpoint (HTML with OG tags)
  - Implement POST /share/track endpoint
  - Add share analytics tracking
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 12.2 Build social share components
  - Create ShareWidget component
  - Add platform-specific share buttons (Facebook, Twitter, Discord, Telegram)
  - Implement share preview
  - Add share success notifications
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 13. Implement social graph features
  - Create social_follows database table
  - Implement friend import from social platforms
  - Create follow/unfollow functionality
  - Build activity feed generation
  - Implement privacy settings
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 13.1 Create social graph API endpoints
  - Implement GET /social/friends endpoint
  - Implement POST /social/follow/:userId endpoint
  - Implement GET /social/feed endpoint
  - Implement GET /social/leaderboard endpoint
  - Implement PUT /social/privacy endpoint
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 13.2 Build social graph UI components
  - Create FriendsList component
  - Create ActivityFeed component
  - Create Leaderboard component
  - Create PrivacySettings component
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 14. Implement community markets
  - Create community_markets database table
  - Implement market creation for Discord admins
  - Add community member verification
  - Implement market resolution logic
  - Add 1% platform fee collection
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 14.1 Create community markets API endpoints
  - Implement POST /communities/:id/markets endpoint
  - Implement GET /communities/:id/markets endpoint
  - Implement POST /communities/:id/markets/:id/resolve endpoint
  - Implement GET /communities/:id/members endpoint
  - Add admin authorization checks
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ]* 14.2 Build community markets UI
  - Create CommunityMarketsList component
  - Create CreateMarketForm component (admin only)
  - Create MarketResolution component (admin only)
  - Add community-specific branding
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 15. Implement compliance features
  - Add age verification (18+) on signup
  - Implement platform policy compliance checks
  - Create terms of service for social token usage
  - Add data deletion functionality (GDPR)
  - Implement consent management
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 16. Add security measures
  - Encrypt OAuth tokens in database
  - Implement rate limiting on social endpoints
  - Add webhook signature verification
  - Implement CSRF protection for OAuth
  - Add suspicious activity monitoring
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 17. Write integration tests
  - Test OAuth flows for all providers
  - Test token conversion logic
  - Test referral tracking and rewards
  - Test reputation calculations
  - Test social sharing functionality
  - Test community markets
  - _Requirements: All requirements (testing)_

- [ ]* 17.1 Write end-to-end tests
  - Test complete social login flow
  - Test complete token deposit flow
  - Test complete referral flow
  - Test complete sharing flow
  - _Requirements: All requirements (testing)_

- [ ] 18. Create documentation
  - Document OAuth setup for each platform
  - Document token conversion rates and fees
  - Create user guide for social features
  - Document API endpoints
  - Add troubleshooting guide
  - _Requirements: All requirements (documentation)_

- [ ] 19. Deploy and monitor
  - Set up production OAuth apps
  - Configure production environment variables
  - Deploy backend and frontend
  - Set up monitoring and alerting
  - Monitor social platform API usage
  - _Requirements: All requirements (deployment)_

## Notes

- Tasks marked with `*` are optional and can be deferred to post-MVP
- OAuth apps must be created and approved by each platform before production
- Token conversion rates depend on platform API availability
- Community markets are Discord-focused initially, can expand to other platforms
- Compliance requirements vary by jurisdiction

## Testing Strategy

### OAuth Testing
- Test login flow for each provider
- Test account linking
- Test token refresh
- Test error scenarios

### Token Conversion Testing
- Test rate fetching and caching
- Test deposit and withdrawal flows
- Test fee calculations
- Mock social platform APIs

### Social Features Testing
- Test friend import
- Test sharing functionality
- Test referral tracking
- Test reputation calculations

## Success Criteria

- ✅ Users can login with Facebook, Twitter, Discord
- ✅ Users can deposit social tokens and receive MUSD
- ✅ Users can share predictions and wins
- ✅ Referral system tracks and rewards correctly
- ✅ Reputation system calculates accurately
- ✅ Community markets work for Discord servers
- ✅ All social platform policies are followed
- ✅ Privacy settings are respected
- ✅ System is secure and compliant
