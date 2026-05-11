# Requirements Document - Social Token Integration (Phase 5)

## Introduction

This document outlines the requirements for integrating social platform tokens (Facebook/Meta tokens, Twitter/X tokens, Discord tokens) and enabling social features within the Eventflow prediction market platform. This feature allows users to trade using social platform currencies and share predictions across social networks.

## Glossary

- **Social_Token**: A token issued by or associated with a social media platform
- **Social_Connector**: A service that integrates with social platform APIs
- **Meta_Token**: Facebook/Meta's digital currency or credits system
- **Social_Wallet**: A wallet that holds social platform tokens
- **Social_Share**: The ability to share predictions and results on social media
- **Social_Login**: Authentication via social media accounts
- **Reputation_System**: A system that tracks user prediction accuracy across platforms
- **Social_Graph**: The network of connections between users on social platforms
- **Viral_Incentive**: Rewards for sharing and bringing new users to the platform

## Requirements

### Requirement 1: Social Login Integration

**User Story:** As a user, I want to sign in with my Facebook, Twitter, or Discord account, so that I can start trading without creating a new account.

#### Acceptance Criteria

1. THE Social_Connector SHALL support OAuth 2.0 login for Facebook, Twitter, and Discord
2. WHEN a user logs in via social platform, THE Social_Connector SHALL create or link a wallet address
3. THE Social_Connector SHALL request minimal permissions (profile, email only)
4. THE Social_Connector SHALL store social platform user ID for future logins
5. THE Social_Connector SHALL allow users to link multiple social accounts to one wallet

### Requirement 2: Meta Token Integration

**User Story:** As a Facebook user, I want to use my Meta credits to trade on prediction markets, so that I can use my existing social platform balance.

#### Acceptance Criteria

1. THE Social_Connector SHALL integrate with Meta's payment API
2. WHEN a user deposits Meta tokens, THE Social_Connector SHALL convert to MUSD at current rate
3. THE Social_Connector SHALL support Meta's in-app purchase flow
4. THE Social_Connector SHALL handle Meta token withdrawals back to user's Meta wallet
5. THE Social_Connector SHALL comply with Meta's platform policies and fee structure

### Requirement 3: Twitter/X Token Integration

**User Story:** As a Twitter user, I want to use Twitter's digital currency for trading, so that I can participate using my social platform balance.

#### Acceptance Criteria

1. THE Social_Connector SHALL integrate with Twitter's payment API (when available)
2. THE Social_Connector SHALL support Twitter Tips/Subscriptions as payment method
3. THE Social_Connector SHALL convert Twitter tokens to MUSD for trading
4. THE Social_Connector SHALL enable withdrawals to Twitter wallet
5. THE Social_Connector SHALL display Twitter username as trader ID option

### Requirement 4: Discord Token Integration

**User Story:** As a Discord community member, I want to use Discord server tokens for trading, so that I can participate with my community currency.

#### Acceptance Criteria

1. THE Social_Connector SHALL integrate with Discord's economy bots (MEE6, Dyno, etc.)
2. THE Social_Connector SHALL support custom Discord server tokens
3. THE Social_Connector SHALL allow server admins to whitelist their tokens
4. THE Social_Connector SHALL convert Discord tokens to MUSD at admin-set rates
5. THE Social_Connector SHALL enable community-specific prediction markets

### Requirement 5: Social Sharing Features

**User Story:** As a user, I want to share my predictions and wins on social media, so that I can show my friends and attract new users.

#### Acceptance Criteria

1. THE Social_Share SHALL generate shareable cards with prediction details and user stats
2. WHEN a user wins, THE Social_Share SHALL create a "I won X on Y prediction" post
3. THE Social_Share SHALL include referral links that credit the sharing user
4. THE Social_Share SHALL support Facebook, Twitter, Discord, and Telegram
5. THE Social_Share SHALL respect user privacy settings and allow opt-out

### Requirement 6: Referral and Viral Incentives

**User Story:** As a user who shares predictions, I want to earn rewards when friends join, so that I'm incentivized to grow the platform.

#### Acceptance Criteria

1. WHEN a new user signs up via referral link, THE Viral_Incentive SHALL credit referrer with 5 MUSD
2. WHEN a referred user makes their first trade, THE Viral_Incentive SHALL credit referrer with 2% of trade volume
3. THE Viral_Incentive SHALL track referral chains up to 2 levels deep
4. THE Viral_Incentive SHALL display referral stats (clicks, signups, earnings) in user dashboard
5. THE Viral_Incentive SHALL cap referral earnings at $1,000 per month per user

### Requirement 7: Social Reputation System

**User Story:** As a user, I want my prediction accuracy to be visible on my social profiles, so that I can build credibility.

#### Acceptance Criteria

1. THE Reputation_System SHALL calculate accuracy score (correct predictions / total predictions)
2. THE Reputation_System SHALL track total volume traded and markets participated in
3. THE Reputation_System SHALL generate shareable badges (Novice, Expert, Master Predictor)
4. THE Reputation_System SHALL allow users to display badges on social profiles
5. THE Reputation_System SHALL create leaderboards for each social platform

### Requirement 8: Social Graph Integration

**User Story:** As a user, I want to see what my friends are predicting, so that I can follow their trades or compete with them.

#### Acceptance Criteria

1. THE Social_Graph SHALL import friend lists from connected social platforms
2. THE Social_Graph SHALL show friends' public predictions in a feed
3. THE Social_Graph SHALL allow users to follow other traders (even non-friends)
4. THE Social_Graph SHALL display friend leaderboards and competitions
5. THE Social_Graph SHALL respect privacy settings (public, friends-only, private)

### Requirement 9: Community Markets

**User Story:** As a Discord server admin, I want to create prediction markets for my community, so that members can trade on community-specific events.

#### Acceptance Criteria

1. THE Social_Connector SHALL allow verified admins to create custom markets
2. THE Social_Connector SHALL restrict market visibility to community members only
3. THE Social_Connector SHALL support community-specific tokens for trading
4. THE Social_Connector SHALL allow admins to resolve markets or delegate to oracles
5. THE Social_Connector SHALL take 1% fee on community market volume

### Requirement 10: Social Token Conversion Rates

**User Story:** As a user trading with social tokens, I want fair and transparent conversion rates, so that I know the value of my trades.

#### Acceptance Criteria

1. THE Social_Connector SHALL display conversion rates for all social tokens
2. THE Social_Connector SHALL update rates every 5 minutes from platform APIs
3. THE Social_Connector SHALL show historical rate charts for transparency
4. THE Social_Connector SHALL apply platform fee (2%) on top of conversion rate
5. THE Social_Connector SHALL allow users to lock in rates for 60 seconds during checkout

### Requirement 11: Compliance and Platform Policies

**User Story:** As the platform operator, I want to comply with all social platform policies, so that we maintain good standing and avoid bans.

#### Acceptance Criteria

1. THE Social_Connector SHALL comply with Meta's Platform Policy and Monetization Policy
2. THE Social_Connector SHALL comply with Twitter's Developer Agreement
3. THE Social_Connector SHALL comply with Discord's Terms of Service
4. THE Social_Connector SHALL implement age verification (18+ for real money trading)
5. THE Social_Connector SHALL provide clear terms of service for social token usage
