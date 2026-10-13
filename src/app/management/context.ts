import { createContext, useContext } from 'react'

export const ManagementAppearanceContext = createContext(false)

export function useManagementAppearance() {
  return useContext(ManagementAppearanceContext)
}
