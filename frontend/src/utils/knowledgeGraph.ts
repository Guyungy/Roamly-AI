import type { GraphCategory, GraphEdge, GraphNode, KnowledgeGraphData, TripPlan } from '@/types'

/**
 * 在前端从 TripPlan 推导知识图谱。
 *
 * 为什么需要它：自建后端 /api/trip 才会随行程一起返回 graph_data；
 * 走云模型的路径不会有这份数据，但结果页的「知识图谱」区块是常驻展开的，
 * 不能空着。这里的结构、分类名、节点尺寸都和后端
 * backend/app/services/knowledge_graph_service.py 保持一致。
 */

const CATEGORY_NAMES = ['城市', '日程', '景点', '酒店', '餐饮', '天气', '预算', '偏好/建议'] as const

const CATEGORY_KEY_BY_NAME: Record<string, string> = {
  城市: 'city',
  日程: 'schedule',
  景点: 'attraction',
  酒店: 'hotel',
  餐饮: 'meal',
  天气: 'weather',
  预算: 'budget',
  '偏好/建议': 'suggestion',
}

const NODE_COLORS: Record<string, string> = {
  city: '#4A90D9',
  schedule: '#5B8FF9',
  attraction: '#5AD8A6',
  hotel: '#F6BD16',
  meal: '#E8684A',
  weather: '#6DC8EC',
  budget: '#FF9845',
  suggestion: '#B37FEB',
}

const NODE_SIZES: Record<string, number> = {
  city: 70,
  schedule: 45,
  attraction: 35,
  hotel: 35,
  meal: 25,
  weather: 28,
  budget: 40,
  suggestion: 30,
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '小吃',
}

export function buildKnowledgeGraphFromPlan(plan: TripPlan): KnowledgeGraphData {
  const categories: GraphCategory[] = CATEGORY_NAMES.map((name) => ({ name }))
  const categoryIndex = new Map<string, number>(CATEGORY_NAMES.map((name, index) => [name, index]))

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const seen = new Set<string>()

  const addNode = (id: string, name: string, categoryName: string, value = '') => {
    if (seen.has(id)) return
    seen.add(id)
    const key = CATEGORY_KEY_BY_NAME[categoryName] ?? 'city'
    nodes.push({
      id,
      name,
      category: categoryIndex.get(categoryName) ?? 0,
      symbolSize: NODE_SIZES[key] ?? 30,
      itemStyle: { color: NODE_COLORS[key] ?? '#999' },
      value,
    })
  }

  const addEdge = (source: string, target: string, label = '') => {
    edges.push({ source, target, label })
  }

  const cityId = `city_${plan.city}`
  addNode(cityId, plan.city, '城市', `${plan.start_date} ~ ${plan.end_date}`)

  plan.days.forEach((day) => {
    const dayId = `day_${day.day_index}`
    addNode(dayId, `第${day.day_index + 1}天`, '日程', day.date)
    addEdge(cityId, dayId, '行程')

    day.attractions.forEach((attr, i) => {
      const attrId = `attr_${day.day_index}_${i}_${attr.name}`
      const parts: string[] = []
      if (attr.address) parts.push(attr.address)
      if (attr.visit_duration) parts.push(`游览${attr.visit_duration}分钟`)
      if (attr.ticket_price) parts.push(`门票¥${attr.ticket_price}`)
      addNode(attrId, attr.name, '景点', parts.join(' | '))
      addEdge(dayId, attrId, '游览')

      if (i > 0) {
        const prev = day.attractions[i - 1]
        addEdge(`attr_${day.day_index}_${i - 1}_${prev.name}`, attrId, '下一站')
      }
    })

    if (day.hotel) {
      const hotelId = `hotel_${day.day_index}_${day.hotel.name}`
      const detail = day.hotel.estimated_cost
        ? `${day.hotel.price_range} | ¥${day.hotel.estimated_cost}/晚`
        : day.hotel.price_range
      addNode(hotelId, day.hotel.name, '酒店', detail || '')
      addEdge(dayId, hotelId, '入住')
    }

    day.meals.forEach((meal, j) => {
      const label = MEAL_LABELS[meal.type] ?? meal.type
      addNode(
        `meal_${day.day_index}_${j}_${meal.name}`,
        `${label}: ${meal.name}`,
        '餐饮',
        meal.estimated_cost ? `¥${meal.estimated_cost}` : ''
      )
      addEdge(dayId, `meal_${day.day_index}_${j}_${meal.name}`, label)
    })
  })

  plan.weather_info?.forEach((weather) => {
    const weatherId = `weather_${weather.date}`
    addNode(weatherId, `${weather.day_weather} ${weather.day_temp}°C`, '天气', weather.date)
    const matched = plan.days.find((day) => day.date === weather.date)
    if (matched) addEdge(`day_${matched.day_index}`, weatherId, '天气')
  })

  if (plan.budget) {
    const budgetId = 'budget_total'
    addNode(budgetId, `总预算 ¥${plan.budget.total}`, '预算', '')
    addEdge(cityId, budgetId, '预算')

    const subs: Array<[string, number]> = [
      ['景点', plan.budget.total_attractions],
      ['酒店', plan.budget.total_hotels],
      ['餐饮', plan.budget.total_meals],
      ['交通', plan.budget.total_transportation],
    ]
    subs.forEach(([label, value]) => {
      if (!value) return
      const subId = `budget_${label}`
      addNode(subId, `${label} ¥${value}`, '预算', '')
      addEdge(budgetId, subId, label)
    })
  }

  if (plan.overall_suggestions) {
    const text = plan.overall_suggestions
    addNode('suggestion_overall', text.length > 30 ? `${text.slice(0, 30)}...` : text, '偏好/建议', text)
    addEdge(cityId, 'suggestion_overall', '建议')
  }

  return { nodes, edges, categories }
}
