<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import gameConfig from '../config/gameConfig'
import type { TitleConfig, TitleStyle } from '../types/game'

const gameStore = useGameStore()

const event = computed(() => gameStore.currentEvent)

const characterConfig = computed(() => {
  if (!event.value?.characterId) return null
  return gameConfig.characters.find(c => c.id === event.value!.characterId)
})

const activeTitle = computed<TitleConfig | null>(() => gameStore.activeTitle)

const addressTerm = computed(() => {
  if (!event.value?.characterId || !activeTitle.value) return null
  return activeTitle.value.addressTerms[event.value.characterId] || null
})

const stylePrefixMap: Record<TitleStyle, string> = {
  romantic: '浪漫的你',
  generous: '慷慨的你',
  hardworking: '勤劳的你',
  devoted: '专情的你',
  playboy: '魅力四射的你',
  cautious: '沉稳的你',
  adventurous: '大胆的你'
}

const styledDescription = computed(() => {
  if (!event.value) return ''
  let desc = event.value.description

  if (activeTitle.value) {
    const prefix = stylePrefixMap[activeTitle.value.style]
    desc = desc.replace(/你/g, prefix)
  }
  return desc
})

const titleStyleTag = computed(() => {
  if (!activeTitle.value) return null
  const styleMap: Record<string, { label: string; color: string }> = {
    romantic: { label: '浪漫风', color: '#ec4899' },
    generous: { label: '慷慨风', color: '#3b82f6' },
    hardworking: { label: '勤劳风', color: '#eab308' },
    devoted: { label: '专情风', color: '#ef4444' },
    playboy: { label: '风流风', color: '#a855f7' },
    cautious: { label: '谨慎风', color: '#14b8a6' },
    adventurous: { label: '冒险风', color: '#f97316' }
  }
  return styleMap[activeTitle.value.style]
})

function handleChoice(choiceId: string) {
  const choice = event.value?.choices.find(c => c.id === choiceId)
  if (choice) {
    gameStore.handleEventChoice(choice)
  }
}

function applyTitleModifierToAffinity(characterId: string, baseChange: number): { value: number; bonus: number } {
  if (!activeTitle.value || baseChange <= 0) return { value: baseChange, bonus: 0 }

  let multiplier = 1
  const mod = activeTitle.value.rewardModifier
  if (mod.chatAffinityMultiplier) multiplier = Math.max(multiplier, mod.chatAffinityMultiplier)
  if (mod.giftAffinityMultiplier) multiplier = Math.max(multiplier, mod.giftAffinityMultiplier)

  const modified = Math.round(baseChange * multiplier)
  return { value: modified, bonus: modified - baseChange }
}

function applyTitleModifierToMood(baseChange: number): { value: number; bonus: number } {
  if (!activeTitle.value || baseChange <= 0) return { value: baseChange, bonus: 0 }

  let multiplier = 1
  if (activeTitle.value.rewardModifier.moodBonusMultiplier) {
    multiplier = activeTitle.value.rewardModifier.moodBonusMultiplier
  }

  const modified = Math.round(baseChange * multiplier)
  return { value: modified, bonus: modified - baseChange }
}

function formatEffect(effect: any): string {
  let result = ''
  if (effect.affinityChange !== undefined) {
    const char = gameConfig.characters.find(c => c.id === effect.characterId)
    const name = char?.name || effect.characterId
    const { value, bonus } = applyTitleModifierToAffinity(effect.characterId, effect.affinityChange)
    const sign = value > 0 ? '+' : ''
    result += `${name} 好感 ${sign}${value}`
    if (bonus > 0) result += `（+${bonus}称号）`
  }
  if (effect.moodChange !== undefined) {
    if (result) result += '，'
    const { value, bonus } = applyTitleModifierToMood(effect.moodChange)
    const sign = value > 0 ? '+' : ''
    result += `心情 ${sign}${value}`
    if (bonus > 0) result += `（+${bonus}称号）`
  }
  return result
}
</script>

<template>
  <Teleport to="body">
    <div v-if="gameStore.showEventModal && event" class="modal-overlay" @click.self="">
      <div class="modal-content event-modal">
        <div class="event-header">
          <div v-if="characterConfig" class="event-character">
            <span class="char-avatar">{{ characterConfig.avatar }}</span>
            <span class="char-name">
              {{ characterConfig.name }}
              <span v-if="addressTerm" class="char-address">（「{{ addressTerm }}」）</span>
            </span>
          </div>
          <div class="event-tags">
            <span v-if="titleStyleTag" class="style-tag" :style="{ backgroundColor: titleStyleTag.color }">
              {{ titleStyleTag.label }}
            </span>
            <span class="event-tag">剧情事件</span>
          </div>
        </div>

        <div v-if="activeTitle" class="title-banner">
          <span class="title-icon">{{ activeTitle.icon }}</span>
          <span class="title-name">{{ activeTitle.name }}</span>
          <span class="title-desc">称号效果生效中</span>
        </div>

        <h2 class="event-title">{{ event.title }}</h2>
        
        <p class="event-description" :class="{ 'styled-desc': styledDescription !== event.description }">
          {{ styledDescription }}
        </p>

        <div class="event-choices">
          <button
            v-for="choice in event.choices"
            :key="choice.id"
            class="choice-btn"
            @click="handleChoice(choice.id)"
          >
            <span class="choice-text">{{ choice.text }}</span>
            <div class="choice-effects">
              <span 
                v-for="(effect, idx) in choice.effects" 
                :key="idx"
                class="effect-tag"
                :class="{ positive: effect.affinityChange > 0 || effect.moodChange > 0, negative: effect.affinityChange < 0 || effect.moodChange < 0 }"
              >
                {{ formatEffect(effect) }}
              </span>
              <span v-if="choice.resourceChange" class="effect-tag" :class="{ positive: choice.resourceChange > 0, negative: choice.resourceChange < 0 }">
                代币 {{ choice.resourceChange > 0 ? '+' : '' }}{{ choice.resourceChange }}
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.event-modal {
  padding: 32px;
}

.event-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.event-character {
  display: flex;
  align-items: center;
  gap: 10px;
}

.char-avatar {
  width: 40px;
  height: 40px;
  background: var(--bg-tertiary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.char-name {
  font-weight: 600;
  font-size: 15px;
}

.char-address {
  font-size: 12px;
  color: var(--accent-primary);
  font-weight: 500;
  margin-left: 2px;
}

.event-tags {
  display: flex;
  gap: 6px;
  align-items: center;
}

.style-tag {
  font-size: 12px;
  padding: 4px 10px;
  color: white;
  border-radius: 9999px;
  font-weight: 500;
}

.event-tag {
  font-size: 12px;
  padding: 4px 12px;
  background: var(--accent-primary);
  color: white;
  border-radius: 9999px;
}

.title-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: linear-gradient(135deg, var(--accent-light), transparent);
  border-radius: var(--radius-md);
  margin-bottom: 16px;
  border-left: 3px solid var(--accent-primary);
}

.title-banner .title-icon {
  font-size: 20px;
}

.title-banner .title-name {
  font-weight: 600;
  color: var(--accent-primary);
  font-size: 14px;
}

.title-banner .title-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: auto;
}

.event-title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 16px;
  color: var(--text-primary);
}

.event-description {
  font-size: 15px;
  line-height: 1.8;
  color: var(--text-secondary);
  margin-bottom: 28px;
  padding: 16px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  transition: all 0.3s;
}

.event-description.styled-desc {
  border-left: 4px solid var(--accent-primary);
  background: linear-gradient(90deg, var(--accent-light) 0%, var(--bg-tertiary) 100%);
}

.event-choices {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.choice-btn {
  width: 100%;
  padding: 16px 20px;
  text-align: left;
  background: var(--bg-tertiary);
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  transition: all 0.2s;
}

.choice-btn:hover {
  border-color: var(--accent-primary);
  background: var(--accent-light);
  transform: translateX(4px);
}

.choice-text {
  display: block;
  font-size: 15px;
  font-weight: 500;
  margin-bottom: 6px;
  color: var(--text-primary);
}

.choice-effects {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.effect-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.effect-tag.positive {
  background: #dcfce7;
  color: #166534;
}

[data-theme='dark'] .effect-tag.positive {
  background: #14532d;
  color: #86efac;
}

.effect-tag.negative {
  background: #fee2e2;
  color: #991b1b;
}

[data-theme='dark'] .effect-tag.negative {
  background: #7f1d1d;
  color: #fca5a5;
}
</style>
