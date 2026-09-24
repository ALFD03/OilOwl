import type { components } from './schema'

type S = components['schemas']

export interface Paginated<T> {
  count: number
  page: number
  pages: number
  results: T[]
}

export type Me = S['Me']
export type User = S['User']
export type Role = S['Role']
export type PermissionItem = S['Permission']
export type Station = S['Station']
export type FuelType = S['FuelType']
export type Island = S['Island']
export type Pump = S['Pump']
export type FuelPrice = S['FuelPrice']
export type Denomination = S['Denomination']
export type PaymentTerminal = S['PaymentTerminal']
export type Attendant = S['Attendant']
export type ExchangeRate = S['ExchangeRate']
export type ShiftTemplate = S['ShiftTemplate']
export type Assignment = S['Assignment']
export type Shift = S['Shift']
export type Closure = S['Closure']
export type ClosureListItem = S['ClosureList']
export type MeterReading = S['MeterReading']
export type ClosureLine = S['ClosureLine']
export type ClosureAdjustment = S['ClosureAdjustment']
export type ChainVerification = S['ChainVerification']
export type Tank = S['Tank']
export type TankReading = S['TankReading']
export type Delivery = S['Delivery']
export type Reconciliation = S['Reconciliation']
export type AuditLog = S['AuditLog']
export type PaymentMethod = S['PaymentMethodEnum']
export type Currency = S['CurrencyEnum']
