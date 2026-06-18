import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TimeOfDay, ActionType, GameEventConfig, EventChoice, BehaviorStats, TitleConfig } from '../types/game'
import gameConfig from '../config/gameConfig'
import {
  clamp,
  randomInt,
  calculateChatAffinity,
  calculateGiftAffinity,
  isGiftLiked,
  isGiftDisliked,
  getTimeLabel,
  getNextTimeSlot,
  getMoodLabel
} from '../utils/gameUtils'

export interface CharacterState {
  id: string
  affinity: number
  mood: number
  unlocked: boolean
}

export interface LogEntry {
  id: number
  day: number
  time: TimeOfDay
  type: 'action' | 'event' | 'system' | 'story' | 'title'
  message: string
  characterId?: string
  timestamp: number
}

export interface HistorySnapshot {
  day: number
  timeSlot: TimeOfDay
  actionsRemaining: number
  resources: number
  characters: CharacterState[]
  flags: string[]
  triggeredEvents: string[]
  collectedCards: string[]
  earnedTitles: string[]
  activeTitleId: string | null
  behaviorStats: BehaviorStats
  logs: LogEntry[]
}

export const useGameStore = defineStore('game', () => {
  const day = ref(1)
  const timeSlot = ref<TimeOfDay>('morning')
  const actionsRemaining = ref(gameConfig.maxActionsPerDay)
  const resources = ref(gameConfig.initialResources)
  const selectedCharacterId = ref<string | null>(null)
  const currentEvent = ref<GameEventConfig | null>(null)
  const showEventModal = ref(false)
  const darkMode = ref(false)
  const earnedTitles = ref<string[]>([])
  const activeTitleId = ref<string | null>(null)

  const characters = ref<CharacterState[]>(
    gameConfig.characters.map(c => ({
      id: c.id,
      affinity: c.baseAffinity,
      mood: c.baseMood,
      unlocked: c.unlocked && !c.hidden
    }))
  )

  const flags = ref<string[]>([])
  const triggeredEvents = ref<string[]>([])
  const collectedCards = ref<string[]>([])
  const logs = ref<LogEntry[]>([])
  const history = ref<HistorySnapshot[]>([])
  const behaviorStats = ref<BehaviorStats>({
    chatCount: 0,
    giftCount: 0,
    totalGiftSpent: 0,
    workCount: 0,
    positiveChoiceCount: 0,
    riskyChoiceCount: 0,
    totalChoiceCount: 0
  })
  let logIdCounter = 0

  const unlockedCharacters = computed(() =>
    characters.value.filter(c => c.unlocked)
  )

  const currentCharacter = computed(() =>
    characters.value.find(c => c.id === selectedCharacterId.value) || null
  )

  const currentCharacterConfig = computed(() =>
    gameConfig.characters.find(c => c.id === selectedCharacterId.value) || null
  )

  const activeTitle = computed<TitleConfig | null>(() => {
    if (!activeTitleId.value) return null
    return gameConfig.titles.find(t => t.id === activeTitleId.value) || null
  })

  const earnedTitleConfigs = computed(() => {
    return earnedTitles.value
      .map(id => gameConfig.titles.find(t => t.id === id))
      .filter((t): t is TitleConfig => t !== undefined)
      .sort((a, b) => b.priority - a.priority)
  })

  const unlockedTitleCount = computed(() => earnedTitles.value.length)
  const totalTitleCount = computed(() => gameConfig.titles.length)

  function addLog(type: LogEntry['type'], message: string, characterId?: string) {
    logs.value.push({
      id: ++logIdCounter,
      day: day.value,
      time: timeSlot.value,
      type,
      message,
      characterId,
      timestamp: Date.now()
    })
  }

  function saveHistory() {
    history.value.push({
      day: day.value,
      timeSlot: timeSlot.value,
      actionsRemaining: actionsRemaining.value,
      resources: resources.value,
      characters: JSON.parse(JSON.stringify(characters.value)),
      flags: [...flags.value],
      triggeredEvents: [...triggeredEvents.value],
      collectedCards: [...collectedCards.value],
      earnedTitles: [...earnedTitles.value],
      activeTitleId: activeTitleId.value,
      behaviorStats: { ...behaviorStats.value },
      logs: JSON.parse(JSON.stringify(logs.value))
    })
    if (history.value.length > 100) {
      history.value.shift()
    }
  }

  function rollbackToStep(stepIndex: number) {
    if (stepIndex < 0 || stepIndex >= history.value.length) return
    const snapshot = history.value[stepIndex]
    day.value = snapshot.day
    timeSlot.value = snapshot.timeSlot
    actionsRemaining.value = snapshot.actionsRemaining
    resources.value = snapshot.resources
    characters.value = JSON.parse(JSON.stringify(snapshot.characters))
    flags.value = [...snapshot.flags]
    triggeredEvents.value = [...snapshot.triggeredEvents]
    collectedCards.value = [...snapshot.collectedCards]
    earnedTitles.value = [...snapshot.earnedTitles]
    activeTitleId.value = snapshot.activeTitleId
    behaviorStats.value = { ...snapshot.behaviorStats }
    logs.value = JSON.parse(JSON.stringify(snapshot.logs))
    history.value = history.value.slice(0, stepIndex)
    addLog('system', `回退到第 ${snapshot.day} 天 ${getTimeLabel(snapshot.timeSlot)}`)
  }

  function getCharacterState(id: string): CharacterState | undefined {
    return characters.value.find(c => c.id === id)
  }

  function updateCharacterAffinity(characterId: string, change: number) {
    const char = getCharacterState(characterId)
    if (!char || !char.unlocked) return
    const oldAffinity = char.affinity
    char.affinity = clamp(
      char.affinity + change,
      gameConfig.minAffinity,
      gameConfig.maxAffinity
    )
    if (char.affinity >= 40 && oldAffinity < 40) {
      checkCardUnlock(characterId, 40)
    }
    if (char.affinity >= 70 && oldAffinity < 70) {
      checkCardUnlock(characterId, 70)
    }
    if (char.affinity >= 100 && oldAffinity < 100) {
      checkCardUnlock(characterId, 100)
    }
  }

  function checkCardUnlock(characterId: string, threshold: number) {
    const character = gameConfig.characters.find(c => c.id === characterId)
    if (!character) return
    const cardKey = `${characterId}_affinity_${threshold}`
    const card = gameConfig.cards.find(c => c.unlockCondition === cardKey)
    if (card && !collectedCards.value.includes(card.id)) {
      collectedCards.value.push(card.id)
      addLog('system', `🎉 获得新卡牌：${card.name}`, characterId)
    }
  }

  function updateCharacterMood(characterId: string, change: number) {
    const char = getCharacterState(characterId)
    if (!char || !char.unlocked) return

    let finalChange = change
    if (change > 0 && activeTitle.value?.rewardModifier.moodBonusMultiplier) {
      finalChange = Math.round(change * activeTitle.value.rewardModifier.moodBonusMultiplier)
    }

    char.mood = clamp(char.mood + finalChange, gameConfig.minMood, gameConfig.maxMood)
  }

  function checkAndUnlockTitles() {
    const newlyUnlocked: TitleConfig[] = []

    gameConfig.titles.forEach(title => {
      if (earnedTitles.value.includes(title.id)) return
      const cond = title.unlockCondition

      let eligible = true

      if (cond.minChatCount !== undefined && behaviorStats.value.chatCount < cond.minChatCount) {
        eligible = false
      }
      if (cond.minGiftCount !== undefined && behaviorStats.value.giftCount < cond.minGiftCount) {
        eligible = false
      }
      if (cond.minGiftSpent !== undefined && behaviorStats.value.totalGiftSpent < cond.minGiftSpent) {
        eligible = false
      }
      if (cond.minWorkCount !== undefined && behaviorStats.value.workCount < cond.minWorkCount) {
        eligible = false
      }
      if (cond.minDays !== undefined && day.value < cond.minDays) {
        eligible = false
      }
      if (cond.maxUnlockedCharacters !== undefined && unlockedCharacters.value.length > cond.maxUnlockedCharacters) {
        eligible = false
      }
      if (cond.minExclusiveAffinity !== undefined) {
        const hasExclusive = unlockedCharacters.value.some(c => c.affinity >= cond.minExclusiveAffinity!)
        if (!hasExclusive) eligible = false
      }
      if (cond.multiCharacterThreshold !== undefined) {
        const charsAboveThreshold = unlockedCharacters.value.filter(c => c.affinity >= cond.multiCharacterThreshold!).length
        if (charsAboveThreshold < 2) eligible = false
      }
      if (cond.minPositiveChoices !== undefined && behaviorStats.value.positiveChoiceCount < cond.minPositiveChoices) {
        eligible = false
      }
      if (cond.minRiskyChoices !== undefined && behaviorStats.value.riskyChoiceCount < cond.minRiskyChoices) {
        eligible = false
      }

      if (eligible) {
        newlyUnlocked.push(title)
      }
    })

    if (newlyUnlocked.length > 0) {
      newlyUnlocked.forEach(title => {
        earnedTitles.value.push(title.id)
        addLog('title', `🏆 获得新称号：${title.icon} ${title.name} — ${title.description}`)
      })

      newlyUnlocked.sort((a, b) => b.priority - a.priority)
      if (!activeTitleId.value || newlyUnlocked[0].priority > (activeTitle.value?.priority || 0)) {
        activeTitleId.value = newlyUnlocked[0].id
        addLog('title', `✨ 当前称号自动切换为：${newlyUnlocked[0].icon} ${newlyUnlocked[0].name}`)
      }
    }
  }

  function setActiveTitle(titleId: string | null) {
    if (titleId === null) {
      activeTitleId.value = null
      addLog('title', '已取消激活称号')
      return
    }
    if (earnedTitles.value.includes(titleId)) {
      activeTitleId.value = titleId
      const title = gameConfig.titles.find(t => t.id === titleId)
      if (title) {
        addLog('title', `✨ 激活称号：${title.icon} ${title.name}`)
      }
    }
  }

  function getCharacterAddressTerm(characterId: string): string | null {
    if (!activeTitle.value) return null
    return activeTitle.value.addressTerms[characterId] || null
  }

  function applyChatAffinityModifier(baseChange: number): number {
    let result = baseChange
    if (activeTitle.value?.rewardModifier.chatAffinityMultiplier) {
      result = baseChange * activeTitle.value.rewardModifier.chatAffinityMultiplier
    }
    return Math.round(result * 10) / 10
  }

  function applyGiftAffinityModifier(baseChange: number): number {
    let result = baseChange
    if (activeTitle.value?.rewardModifier.giftAffinityMultiplier) {
      result = baseChange * activeTitle.value.rewardModifier.giftAffinityMultiplier
    }
    return Math.round(result * 10) / 10
  }

  function applyWorkRewardModifier(baseReward: number): number {
    let result = baseReward
    if (activeTitle.value?.rewardModifier.workRewardMultiplier) {
      result = Math.round(baseReward * activeTitle.value.rewardModifier.workRewardMultiplier)
    }
    if (activeTitle.value?.rewardModifier.resourceGainBonus) {
      result += activeTitle.value.rewardModifier.resourceGainBonus
    }
    return result
  }

  function advanceTime() {
    const nextSlot = getNextTimeSlot(timeSlot.value, gameConfig.timeSlots)
    if (nextSlot === gameConfig.timeSlots[0]) {
      nextDay()
    } else {
      timeSlot.value = nextSlot
    }
    checkAndTriggerEvent()
  }

  function nextDay() {
    day.value++
    timeSlot.value = gameConfig.timeSlots[0]
    actionsRemaining.value = gameConfig.maxActionsPerDay

    characters.value.forEach(char => {
      if (char.unlocked) {
        char.mood = clamp(
          char.mood - gameConfig.moodDecayPerDay,
          gameConfig.minMood,
          gameConfig.maxMood
        )
        char.affinity = clamp(
          char.affinity - gameConfig.affinityDecayPerDay,
          gameConfig.minAffinity,
          gameConfig.maxAffinity
        )
      }
    })

    addLog('system', `🌅 第 ${day.value} 天开始了`)
  }

  function performAction(actionType: ActionType, targetId?: string, giftId?: string) {
    if (actionsRemaining.value <= 0) {
      addLog('system', '⚠️ 今天的行动次数已用完')
      return false
    }

    const actionConfig = gameConfig.actions.find(a => a.type === actionType)
    if (!actionConfig) return false

    if (actionsRemaining.value < actionConfig.energyCost) {
      addLog('system', '⚠️ 行动点数不足')
      return false
    }

    saveHistory()
    actionsRemaining.value -= actionConfig.energyCost

    switch (actionType) {
      case 'chat':
        return performChat(targetId!)
      case 'gift':
        return performGift(targetId!, giftId!)
      case 'work':
        return performWork()
      default:
        return false
    }
  }

  function performChat(characterId: string): boolean {
    const charState = getCharacterState(characterId)
    const charConfig = gameConfig.characters.find(c => c.id === characterId)
    if (!charState || !charConfig || !charState.unlocked) return false

    const topic = charConfig.chatTopics[
      randomInt(0, charConfig.chatTopics.length - 1)
    ]
    const baseAffinityChange = calculateChatAffinity(
      topic.topic,
      charConfig,
      charState.mood,
      timeSlot.value
    )
    const affinityChange = applyChatAffinityModifier(baseAffinityChange)

    behaviorStats.value.chatCount++

    updateCharacterAffinity(characterId, affinityChange)
    updateCharacterMood(characterId, affinityChange > 0 ? 5 : -3)

    const characterName = charConfig.name
    const addressTerm = getCharacterAddressTerm(characterId)

    let message = ''
    if (addressTerm) {
      message = `${characterName}看向你：「${addressTerm}，我们来聊聊${topic.topic}吧」`
    } else {
      message = `和 ${characterName} 聊起了「${topic.topic}」`
    }

    if (affinityChange > 0) {
      message += `，ta似乎很开心！（好感 +${affinityChange}）`
    } else if (affinityChange < 0) {
      message += `，ta好像不太感兴趣...（好感 ${affinityChange}）`
    } else {
      message += '，气氛平平。'
    }

    addLog('action', message, characterId)
    checkAndUnlockTitles()
    advanceTime()
    return true
  }

  function performGift(characterId: string, giftId: string): boolean {
    const charState = getCharacterState(characterId)
    const charConfig = gameConfig.characters.find(c => c.id === characterId)
    const giftConfig = gameConfig.gifts.find(g => g.id === giftId)
    if (!charState || !charConfig || !giftConfig || !charState.unlocked) return false
    if (resources.value < giftConfig.price) {
      addLog('system', '💰 代币不足！')
      return false
    }

    resources.value -= giftConfig.price
    behaviorStats.value.giftCount++
    behaviorStats.value.totalGiftSpent += giftConfig.price

    const baseAffinityChange = calculateGiftAffinity(
      giftId,
      charConfig,
      giftConfig.price,
      charState.mood
    )
    const affinityChange = applyGiftAffinityModifier(baseAffinityChange)

    updateCharacterAffinity(characterId, affinityChange)
    updateCharacterMood(
      characterId,
      isGiftLiked(giftId, charConfig) ? 15 : isGiftDisliked(giftId, charConfig) ? -10 : 5
    )

    const characterName = charConfig.name
    const addressTerm = getCharacterAddressTerm(characterId)

    let message = ''
    if (addressTerm) {
      message = `${characterName}接过礼物，笑着对你说：「${addressTerm}，你太客气了」`
    } else {
      message = `送给 ${characterName} 一份「${giftConfig.name}」`
    }

    if (isGiftLiked(giftId, charConfig)) {
      message += `，ta非常喜欢！（好感 +${affinityChange}）`
    } else if (isGiftDisliked(giftId, charConfig)) {
      message += `，ta好像不太喜欢...（好感 ${affinityChange}）`
    } else {
      message += `，ta收下了。（好感 +${affinityChange}）`
    }

    addLog('action', message, characterId)
    checkAndUnlockTitles()
    advanceTime()
    return true
  }

  function performWork(): boolean {
    const { min, max } = gameConfig.workRewards
    const baseEarned = randomInt(min, max)
    const earned = applyWorkRewardModifier(baseEarned)
    resources.value += earned

    behaviorStats.value.workCount++

    characters.value.forEach(char => {
      if (char.unlocked) {
        updateCharacterMood(char.id, -2)
      }
    })

    let message = `💼 打工赚了 ${earned} 代币`
    if (earned > baseEarned) {
      message += `（称号加成 +${earned - baseEarned}）`
    }
    message += '（角色们的心情略有下降）'

    addLog('action', message)
    checkAndUnlockTitles()
    advanceTime()
    return true
  }

  function checkAndTriggerEvent() {
    if (currentEvent.value) return

    const availableEvents = gameConfig.events.filter(event => {
      if (event.once && triggeredEvents.value.includes(event.id)) return false

      const cond = event.triggerCondition

      if (cond.minDay !== undefined && day.value < cond.minDay) return false
      if (cond.maxDay !== undefined && day.value > cond.maxDay) return false
      if (cond.timeOfDay !== undefined && timeSlot.value !== cond.timeOfDay) return false

      if (cond.characterId) {
        const charState = getCharacterState(cond.characterId)
        if (!charState || !charState.unlocked) return false
        if (cond.minAffinity !== undefined && charState.affinity < cond.minAffinity) return false
        if (cond.maxAffinity !== undefined && charState.affinity > cond.maxAffinity) return false
      }

      if (cond.requiredFlags) {
        if (!cond.requiredFlags.every(f => flags.value.includes(f))) return false
      }

      return true
    })

    if (availableEvents.length > 0) {
      availableEvents.sort((a, b) => b.priority - a.priority)
      const topEvent = availableEvents[0]
      triggerEvent(topEvent)
    }
  }

  function triggerEvent(event: GameEventConfig) {
    currentEvent.value = event
    showEventModal.value = true
    triggeredEvents.value.push(event.id)
    addLog('event', `📖 触发事件：${event.title}`, event.characterId)
  }

  function handleEventChoice(choice: EventChoice) {
    saveHistory()
    behaviorStats.value.totalChoiceCount++

    const totalAffinityChange = choice.effects.reduce((sum, e) => sum + (e.affinityChange || 0), 0)
    const hasNegativeEffect = choice.effects.some(e => (e.affinityChange || 0) < -5)
    const hasHighCost = (choice.resourceChange || 0) < -30

    if (totalAffinityChange > 0) {
      behaviorStats.value.positiveChoiceCount++
    }
    if (hasNegativeEffect || hasHighCost) {
      behaviorStats.value.riskyChoiceCount++
    }

    choice.effects.forEach(effect => {
      if (effect.affinityChange !== undefined) {
        let affinityChange = effect.affinityChange
        if (affinityChange > 0) {
          if (activeTitleId.value) {
            const title = gameConfig.titles.find(t => t.id === activeTitleId.value)
            if (title?.rewardModifier.chatAffinityMultiplier) {
              affinityChange = Math.round(affinityChange * title.rewardModifier.chatAffinityMultiplier)
            }
          }
        }
        updateCharacterAffinity(effect.characterId, affinityChange)
      }
      if (effect.moodChange !== undefined) {
        updateCharacterMood(effect.characterId, effect.moodChange)
      }
    })

    if (choice.resourceChange !== undefined) {
      resources.value = Math.max(0, resources.value + choice.resourceChange)
    }

    if (choice.unlockCharacterId) {
      const char = characters.value.find(c => c.id === choice.unlockCharacterId)
      if (char) {
        char.unlocked = true
        const charConfig = gameConfig.characters.find(c => c.id === choice.unlockCharacterId)
        addLog('system', `✨ 解锁新角色：${charConfig?.name || choice.unlockCharacterId}`)
      }
    }

    if (choice.addCardId) {
      if (!collectedCards.value.includes(choice.addCardId)) {
        collectedCards.value.push(choice.addCardId)
        const card = gameConfig.cards.find(c => c.id === choice.addCardId)
        addLog('system', `🎴 获得卡牌：${card?.name || choice.addCardId}`)
      }
    }

    addLog('story', `选择了：${choice.text}`)

    currentEvent.value = null
    showEventModal.value = false

    checkAndUnlockTitles()

    if (choice.nextEventId) {
      const nextEvent = gameConfig.events.find(e => e.id === choice.nextEventId)
      if (nextEvent) {
        setTimeout(() => triggerEvent(nextEvent), 300)
      }
    }
  }

  function selectCharacter(id: string) {
    const char = characters.value.find(c => c.id === id)
    if (char && char.unlocked) {
      selectedCharacterId.value = id
    }
  }

  function toggleDarkMode() {
    darkMode.value = !darkMode.value
  }

  function resetGame() {
    day.value = 1
    timeSlot.value = 'morning'
    actionsRemaining.value = gameConfig.maxActionsPerDay
    resources.value = gameConfig.initialResources
    selectedCharacterId.value = null
    currentEvent.value = null
    showEventModal.value = false
    earnedTitles.value = []
    activeTitleId.value = null

    characters.value = gameConfig.characters.map(c => ({
      id: c.id,
      affinity: c.baseAffinity,
      mood: c.baseMood,
      unlocked: c.unlocked && !c.hidden
    }))

    flags.value = []
    triggeredEvents.value = []
    collectedCards.value = []
    logs.value = []
    history.value = []
    behaviorStats.value = {
      chatCount: 0,
      giftCount: 0,
      totalGiftSpent: 0,
      workCount: 0,
      positiveChoiceCount: 0,
      riskyChoiceCount: 0,
      totalChoiceCount: 0
    }
    logIdCounter = 0

    addLog('system', '🎮 游戏开始！欢迎来到恋爱物语')
    checkAndTriggerEvent()
  }

  function initGame() {
    if (logs.value.length === 0) {
      addLog('system', '🎮 游戏开始！欢迎来到恋爱物语')
    }
    checkAndTriggerEvent()
  }

  return {
    day,
    timeSlot,
    actionsRemaining,
    resources,
    characters,
    selectedCharacterId,
    currentCharacter,
    currentCharacterConfig,
    unlockedCharacters,
    flags,
    triggeredEvents,
    collectedCards,
    logs,
    history,
    currentEvent,
    showEventModal,
    darkMode,
    earnedTitles,
    activeTitleId,
    activeTitle,
    earnedTitleConfigs,
    unlockedTitleCount,
    totalTitleCount,
    behaviorStats,
    addLog,
    saveHistory,
    rollbackToStep,
    getCharacterState,
    updateCharacterAffinity,
    updateCharacterMood,
    performAction,
    selectCharacter,
    handleEventChoice,
    toggleDarkMode,
    resetGame,
    initGame,
    checkAndTriggerEvent,
    checkAndUnlockTitles,
    setActiveTitle,
    getCharacterAddressTerm,
    applyChatAffinityModifier,
    applyGiftAffinityModifier,
    applyWorkRewardModifier
  }
})
