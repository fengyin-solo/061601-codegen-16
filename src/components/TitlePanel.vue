<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import gameConfig from '../config/gameConfig'
import type { TitleConfig, TitleStyle } from '../types/game'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const gameStore = useGameStore()

const allTitles = computed(() => gameConfig.titles)

const styleLabelMap: Record<TitleStyle, string> = {
  romantic: '浪漫型',
  generous: '慷慨型',
  hardworking: '勤劳型',
  playboy: '风流型',
  devoted: '专情型',
  cautious: '谨慎型',
  adventurous: '冒险型'
}

const styleColorMap: Record<TitleStyle, string> = {
  romantic: 'linear-gradient(135deg, #ec4899, #f472b6)',
  generous: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
  hardworking: 'linear-gradient(135deg, #eab308, #facc15)',
  playboy: 'linear-gradient(135deg, #a855f7, #c084fc)',
  devoted: 'linear-gradient(135deg, #ef4444, #f87171)',
  cautious: 'linear-gradient(135deg, #14b8a6, #2dd4bf)',
  adventurous: 'linear-gradient(135deg, #f97316, #fb923c)'
}

function isUnlocked(titleId: string): boolean {
  return gameStore.earnedTitles.includes(titleId)
}

function isActive(titleId: string): boolean {
  return gameStore.activeTitleId === titleId
}

function activateTitle(titleId: string) {
  gameStore.setActiveTitle(titleId)
}

function deactivateTitle() {
  gameStore.setActiveTitle(null)
}

function getProgress(title: TitleConfig): { current: number; total: number; label: string } | null {
  const cond = title.unlockCondition
  if (cond.minChatCount !== undefined) {
    return { current: gameStore.behaviorStats.chatCount, total: cond.minChatCount, label: `聊天 ${gameStore.behaviorStats.chatCount}/${cond.minChatCount}` }
  }
  if (cond.minGiftCount !== undefined) {
    return { current: gameStore.behaviorStats.giftCount, total: cond.minGiftCount, label: `送礼 ${gameStore.behaviorStats.giftCount}/${cond.minGiftCount}` }
  }
  if (cond.minGiftSpent !== undefined) {
    return { current: gameStore.behaviorStats.totalGiftSpent, total: cond.minGiftSpent, label: `送礼花费 ${gameStore.behaviorStats.totalGiftSpent}/${cond.minGiftSpent}` }
  }
  if (cond.minWorkCount !== undefined) {
    return { current: gameStore.behaviorStats.workCount, total: cond.minWorkCount, label: `打工 ${gameStore.behaviorStats.workCount}/${cond.minWorkCount}` }
  }
  if (cond.minDays !== undefined) {
    return { current: gameStore.day, total: cond.minDays, label: `天数 ${gameStore.day}/${cond.minDays}` }
  }
  if (cond.minExclusiveAffinity !== undefined) {
    const maxAff = Math.max(...gameStore.unlockedCharacters.map(c => c.affinity), 0)
    return { current: maxAff, total: cond.minExclusiveAffinity, label: `最高好感 ${maxAff}/${cond.minExclusiveAffinity}` }
  }
  if (cond.multiCharacterThreshold !== undefined) {
    const count = gameStore.unlockedCharacters.filter(c => c.affinity >= cond.multiCharacterThreshold!).length
    return { current: count, total: 2, label: `高好感角色 ${count}/2 (≥${cond.multiCharacterThreshold})` }
  }
  if (cond.minPositiveChoices !== undefined) {
    return { current: gameStore.behaviorStats.positiveChoiceCount, total: cond.minPositiveChoices, label: `积极选择 ${gameStore.behaviorStats.positiveChoiceCount}/${cond.minPositiveChoices}` }
  }
  if (cond.minRiskyChoices !== undefined) {
    return { current: gameStore.behaviorStats.riskyChoiceCount, total: cond.minRiskyChoices, label: `冒险选择 ${gameStore.behaviorStats.riskyChoiceCount}/${cond.minRiskyChoices}` }
  }
  return null
}

function formatModifier(modifier: any): string[] {
  const items: string[] = []
  if (modifier.chatAffinityMultiplier) {
    const pct = Math.round((modifier.chatAffinityMultiplier - 1) * 100)
    items.push(`聊天好感 +${pct}%`)
  }
  if (modifier.giftAffinityMultiplier) {
    const pct = Math.round((modifier.giftAffinityMultiplier - 1) * 100)
    items.push(`送礼好感 +${pct}%`)
  }
  if (modifier.workRewardMultiplier) {
    const pct = Math.round((modifier.workRewardMultiplier - 1) * 100)
    items.push(`打工收益 +${pct}%`)
  }
  if (modifier.moodBonusMultiplier) {
    const pct = Math.round((modifier.moodBonusMultiplier - 1) * 100)
    items.push(`心情加成 +${pct}%`)
  }
  if (modifier.resourceGainBonus) {
    items.push(`额外代币 +${modifier.resourceGainBonus}`)
  }
  return items
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal-content title-panel">
        <div class="panel-header">
          <h2 class="panel-title">
            <span class="title-icon">🏆</span>
            称号收藏
          </h2>
          <div class="title-stats">
            已获得 {{ gameStore.unlockedTitleCount }} / {{ gameStore.totalTitleCount }}
          </div>
          <button class="close-btn" @click="emit('close')">✕</button>
        </div>

        <div class="stats-bar">
          <div class="stat-item">
            <span class="stat-icon">💬</span>
            <span class="stat-label">聊天次数</span>
            <span class="stat-value">{{ gameStore.behaviorStats.chatCount }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-icon">🎁</span>
            <span class="stat-label">送礼次数</span>
            <span class="stat-value">{{ gameStore.behaviorStats.giftCount }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-icon">💎</span>
            <span class="stat-label">送礼花费</span>
            <span class="stat-value">{{ gameStore.behaviorStats.totalGiftSpent }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-icon">💼</span>
            <span class="stat-label">打工次数</span>
            <span class="stat-value">{{ gameStore.behaviorStats.workCount }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-icon">✨</span>
            <span class="stat-label">积极选择</span>
            <span class="stat-value">{{ gameStore.behaviorStats.positiveChoiceCount }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-icon">⚡</span>
            <span class="stat-label">冒险选择</span>
            <span class="stat-value">{{ gameStore.behaviorStats.riskyChoiceCount }}</span>
          </div>
        </div>

        <div v-if="gameStore.activeTitle" class="current-active">
          <div class="active-label">当前激活</div>
          <div 
            class="active-card"
            :style="{ background: styleColorMap[gameStore.activeTitle.style] }"
          >
            <span class="active-icon">{{ gameStore.activeTitle.icon }}</span>
            <div class="active-info">
              <div class="active-name">{{ gameStore.activeTitle.name }}</div>
              <div class="active-style">{{ styleLabelMap[gameStore.activeTitle.style] }}</div>
            </div>
            <button class="deactivate-btn" @click="deactivateTitle">取消</button>
          </div>
        </div>

        <div class="title-grid">
          <div
            v-for="title in allTitles"
            :key="title.id"
            class="title-card"
            :class="{ 
              unlocked: isUnlocked(title.id),
              active: isActive(title.id),
              locked: !isUnlocked(title.id)
            }"
          >
            <div class="card-header" :style="{ background: isUnlocked(title.id) ? styleColorMap[title.style] : 'linear-gradient(135deg, #64748b, #94a3b8)' }">
              <span class="card-icon">{{ isUnlocked(title.id) ? title.icon : '🔒' }}</span>
              <div class="card-info">
                <div class="card-name">{{ title.name }}</div>
                <div class="card-style">{{ styleLabelMap[title.style] }}</div>
              </div>
            </div>

            <div class="card-body">
              <p class="card-description">{{ title.description }}</p>

              <div class="modifiers">
                <span v-for="(mod, idx) in formatModifier(title.rewardModifier)" :key="idx" class="modifier-tag">
                  {{ mod }}
                </span>
              </div>

              <div class="address-terms">
                <div class="address-title">角色称呼：</div>
                <div class="address-list">
                  <span v-for="(term, charId) in title.addressTerms" :key="charId" class="address-item">
                    {{ charId }}:「{{ term }}」
                  </span>
                </div>
              </div>

              <div v-if="!isUnlocked(title.id)" class="progress-section">
                <div v-if="getProgress(title)" class="unlock-progress">
                  <div class="progress-bar">
                    <div 
                      class="progress-fill"
                      :style="{ width: `${Math.min(100, (getProgress(title)!.current / getProgress(title)!.total) * 100)}%` }"
                    ></div>
                  </div>
                  <span class="progress-label">{{ getProgress(title)!.label }}</span>
                </div>
              </div>

              <div v-if="isUnlocked(title.id) && !isActive(title.id)" class="card-actions">
                <button class="activate-btn" @click="activateTitle(title.id)">
                  激活称号
                </button>
              </div>
              <div v-else-if="isActive(title.id)" class="card-active-tag">
                ✓ 已激活
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.title-panel {
  width: 90%;
  max-width: 900px;
  max-height: 85vh;
  padding: 28px;
  overflow-y: auto;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-light);
}

.panel-title {
  font-size: 22px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
}

.title-icon {
  font-size: 26px;
}

.title-stats {
  font-size: 14px;
  color: var(--accent-primary);
  font-weight: 600;
  padding: 4px 12px;
  background: var(--accent-light);
  border-radius: 9999px;
}

.close-btn {
  margin-left: auto;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-tertiary);
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #fee2e2;
  transform: scale(1.1);
}

.stats-bar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
  padding: 16px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  margin-bottom: 20px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-icon {
  font-size: 18px;
}

.stat-label {
  font-size: 11px;
  color: var(--text-muted);
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--accent-primary);
}

.current-active {
  margin-bottom: 24px;
}

.active-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
  font-weight: 500;
}

.active-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px;
  border-radius: var(--radius-md);
  color: white;
  position: relative;
  overflow: hidden;
}

.active-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255,255,255,0.1);
}

.active-icon {
  font-size: 32px;
  position: relative;
  z-index: 1;
}

.active-info {
  flex: 1;
  position: relative;
  z-index: 1;
}

.active-name {
  font-size: 18px;
  font-weight: 700;
}

.active-style {
  font-size: 12px;
  opacity: 0.9;
}

.deactivate-btn {
  position: relative;
  z-index: 1;
  padding: 6px 14px;
  background: rgba(255,255,255,0.2);
  border-radius: var(--radius-sm);
  color: white;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s;
}

.deactivate-btn:hover {
  background: rgba(255,255,255,0.35);
}

.title-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.title-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 2px solid transparent;
  transition: all 0.3s;
}

.title-card.unlocked {
  background: var(--bg-primary);
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.title-card.active {
  border-color: var(--accent-primary);
  box-shadow: 0 4px 16px rgba(236, 72, 153, 0.15);
}

.title-card.locked {
  opacity: 0.7;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  color: white;
}

.card-icon {
  font-size: 28px;
}

.card-name {
  font-size: 16px;
  font-weight: 700;
}

.card-style {
  font-size: 11px;
  opacity: 0.9;
}

.card-body {
  padding: 16px;
}

.card-description {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 12px;
}

.modifiers {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.modifier-tag {
  font-size: 11px;
  padding: 3px 8px;
  background: linear-gradient(135deg, #22c55e, #4ade80);
  color: white;
  border-radius: 4px;
  font-weight: 500;
}

.address-terms {
  padding: 10px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  margin-bottom: 12px;
}

.address-title {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.address-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.address-item {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--bg-secondary);
  border-radius: 3px;
  color: var(--text-secondary);
}

.progress-section {
  margin-bottom: 12px;
}

.unlock-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-bar {
  height: 6px;
  background: var(--bg-tertiary);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
  border-radius: 3px;
  transition: width 0.3s;
}

.progress-label {
  font-size: 11px;
  color: var(--text-muted);
  text-align: right;
}

.card-actions {
  display: flex;
  justify-content: center;
}

.activate-btn {
  width: 100%;
  padding: 10px;
  background: var(--accent-primary);
  color: white;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s;
}

.activate-btn:hover {
  background: var(--accent-secondary);
  transform: translateY(-1px);
}

.card-active-tag {
  text-align: center;
  padding: 10px;
  background: linear-gradient(135deg, #22c55e, #4ade80);
  color: white;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
}
</style>
