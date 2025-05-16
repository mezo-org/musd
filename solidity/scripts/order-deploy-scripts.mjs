import { readdirSync, renameSync } from "fs"

const folder = "./deploy/"

const fileToPrefix = (file) => parseFloat(file.split("_")[0])

const files = readdirSync(folder)

const sortedFiles = files.sort((a, b) => {
  const aIndex = fileToPrefix(a)
  const bIndex = fileToPrefix(b)
  return aIndex - bIndex
})

const pad = Math.ceil(Math.log10(sortedFiles.length))
for (let i = 0; i < sortedFiles.length; i++) {
  const file = sortedFiles[i]
  const name = file.split("_").slice(1).join("_")
  const prefix = (i + 1).toString().padStart(pad, "0")
  const newPath = `${folder}${prefix}_${name}`
  const oldPath = `${folder}${file}`
  renameSync(oldPath, newPath)
  // eslint-disable-next-line no-console
  console.log(`${oldPath} => ${newPath}`)
}
