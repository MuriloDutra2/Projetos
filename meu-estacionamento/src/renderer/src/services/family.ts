export async function getFamilyGroup(plate: string) {
  const res = await window.api.getFamilyGroup(plate)
  return res.success ? res.data : null
}

export async function listFamilyGroups() {
  const res = await window.api.listFamilyGroups()
  return res.success ? res.data : []
}

export async function createFamilyGroup(plate: string) {
  return window.api.createFamilyGroup(plate)
}

export async function addFamilyMember(groupId: number, name: string, cpf: string) {
  return window.api.addFamilyMember(groupId, name, cpf)
}

export async function updateFamilyMember(memberId: number, name: string, cpf: string) {
  return window.api.updateFamilyMember(memberId, name, cpf)
}

export async function deleteFamilyMember(memberId: number) {
  return window.api.deleteFamilyMember(memberId)
}

export async function deleteFamilyGroup(groupId: number) {
  return window.api.deleteFamilyGroup(groupId)
}
