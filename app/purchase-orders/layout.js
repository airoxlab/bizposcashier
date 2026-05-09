'use client'
import PlanGate from '../../components/ui/PlanGate'

export default function Layout({ children }) {
  return <PlanGate feature="purchase_orders">{children}</PlanGate>
}
