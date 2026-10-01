import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TripPlan, KnowledgeGraphData } from '@/types'

export const useTripStore = defineStore('trip', () => {
  // State
  const tripPlan = ref<TripPlan | null>(null)
  const graphData = ref<KnowledgeGraphData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const hasTripPlan = computed(() => tripPlan.value !== null)
  const totalDays = computed(() => tripPlan.value?.days?.length ?? 0)
  const totalBudget = computed(() => tripPlan.value?.budget?.total ?? 0)

  // Actions
  function setTripPlan(plan: TripPlan, graph?: KnowledgeGraphData | null) {
    tripPlan.value = plan
    if (graph !== undefined) {
      graphData.value = graph ?? null
    }
    error.value = null
  }

  function clearTripPlan() {
    tripPlan.value = null
    graphData.value = null
    error.value = null
  }

  function setLoading(state: boolean) {
    loading.value = state
  }

  function setError(msg: string | null) {
    error.value = msg
  }

  return {
    // State
    tripPlan,
    graphData,
    loading,
    error,
    // Getters
    hasTripPlan,
    totalDays,
    totalBudget,
    // Actions
    setTripPlan,
    clearTripPlan,
    setLoading,
    setError,
  }
})
