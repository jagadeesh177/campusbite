'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useRef, useState } from 'react'
import { Pencil, Plus, Search, Tags } from 'lucide-react'
import { saveCategoryAction, saveFoodItemAction, toggleAvailabilityAction } from '@/app/actions/canteen'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge, VegMark } from '@/components/ui/badge'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form'
import { FoodImage, Notice } from '@/components/ui/misc'
import { Flash, SubmitButton, useFlash } from '@/components/ui/client'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/cn'
import type { ActionResult } from '@/lib/errors'
import type { MenuAdminData } from '@/lib/queries/menu-admin'

type Item = MenuAdminData['items'][number]
type Category = MenuAdminData['categories'][number]

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-line',
      )}
    >
      <span className={cn('inline-block h-5.5 w-5.5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
    </button>
  )
}

export function MenuManager({ data }: { data: MenuAdminData }) {
  const router = useRouter()
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Item | 'new' | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [flash, setFlash] = useFlash()

  const items = data.items.filter(
    (i) =>
      (filter === 'all' || (filter === 'soldout' ? !i.isAvailable : i.categoryId === filter)) &&
      (!query || i.name.toLowerCase().includes(query.toLowerCase())),
  )

  async function toggle(item: Item) {
    setPending(item.id)
    const r = await toggleAvailabilityAction(item.id, !item.isAvailable)
    setPending(null)
    setFlash(r.ok ? { tone: 'success', text: `${item.name} is now ${item.isAvailable ? 'sold out' : 'available'}.` } : { tone: 'danger', text: r.error })
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Search items</span>
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4.5 w-4.5 -translate-y-1/2 text-muted" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items" className="pl-10" />
            </label>
            <Button size="lg" onClick={() => setEditing('new')}>
              <Plus className="h-5 w-5" /> Add item
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {[{ id: 'all', name: 'All' }, ...data.categories, { id: 'soldout', name: 'Sold out' }].map((c) => (
              <button
                key={c.id}
                onClick={() => setFilter(c.id)}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-sm font-semibold',
                  filter === c.id ? 'border-primary bg-primary text-white' : 'border-line bg-surface hover:border-primary/30',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </CardBody>
        <ul className="divide-y divide-line border-t border-line">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6">
              <FoodImage src={i.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <VegMark isVeg={i.isVeg} />
                  <span className="truncate font-semibold">{i.name}</span>
                  {i.isPopular && <Badge tone="accent">Popular</Badge>}
                  {!i.categoryActive && <Badge tone="warning">Category hidden</Badge>}
                </div>
                <div className="text-sm text-muted">
                  {i.categoryName} · {i.prepTimeMinutes} min · <span className="font-semibold text-ink tabular-nums">{formatINR(i.pricePaise)}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn('hidden text-sm font-semibold sm:inline', i.isAvailable ? 'text-success' : 'text-subtle')}>
                  {i.isAvailable ? 'Available' : 'Sold out'}
                </span>
                <Switch checked={i.isAvailable} onChange={() => toggle(i)} disabled={pending === i.id} label={`${i.name} available`} />
                <Button variant="ghost" size="icon" onClick={() => setEditing(i)} aria-label={`Edit ${i.name}`}>
                  <Pencil className="h-4.5 w-4.5" />
                </Button>
              </div>
            </li>
          ))}
          {items.length === 0 && <li className="px-6 py-10 text-center text-sm text-muted">No items match.</li>}
        </ul>
      </Card>

      <CategoryManager categories={data.categories} />

      {editing && (
        <ItemEditor
          key={editing === 'new' ? 'new' : editing.id}
          item={editing === 'new' ? null : editing}
          categories={data.categories}
          onClose={(saved) => {
            setEditing(null)
            if (saved) {
              setFlash({ tone: 'success', text: 'Item saved.' })
              router.refresh()
            }
          }}
        />
      )}
      <Flash flash={flash} />
    </div>
  )
}

function ItemEditor({ item, categories, onClose }: { item: Item | null; categories: Category[]; onClose: (saved: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [state, action] = useActionState<ActionResult<{ id: string }> | undefined, FormData>(saveFoodItemAction, undefined)
  const [preview, setPreview] = useState<string | null>(item?.imageUrl ?? null)
  const fe = state && !state.ok ? state.fieldErrors : undefined

  useEffect(() => {
    ref.current?.showModal()
  }, [])
  useEffect(() => {
    if (state?.ok) {
      ref.current?.close()
      onClose(true)
    }
  }, [state, onClose])

  return (
    <dialog ref={ref} onClose={() => onClose(false)} className="m-auto max-h-[92dvh] w-[min(94vw,560px)] overflow-y-auto rounded-2xl border border-line bg-surface p-0 shadow-lift">
      <form action={action} className="space-y-4 p-6" encType="multipart/form-data">
        <h2 className="text-lg font-semibold">{item ? `Edit ${item.name}` : 'Add menu item'}</h2>
        {state && !state.ok && <Notice tone="danger">{state.error}</Notice>}
        {item && <input type="hidden" name="id" value={item.id} />}
        <div className="flex items-center gap-4">
          <FoodImage src={preview} alt="" className="h-20 w-20 shrink-0 rounded-xl" />
          <Field label="Photo" htmlFor="image" hint="JPEG, PNG or WebP, up to 1.5 MB." className="flex-1">
            <input
              id="image"
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:font-semibold file:text-primary"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setPreview(URL.createObjectURL(f))
              }}
            />
          </Field>
        </div>
        <Field label="Name" htmlFor="name" error={fe?.name}>
          <Input id="name" name="name" defaultValue={item?.name} required maxLength={60} />
        </Field>
        <Field label="Description" htmlFor="description" error={fe?.description}>
          <Textarea id="description" name="description" defaultValue={item?.description} required maxLength={240} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Price (₹)" htmlFor="price" error={fe?.price}>
            <Input id="price" name="price" inputMode="decimal" defaultValue={item?.price} required placeholder="45.00" />
          </Field>
          <Field label="Prep time (min)" htmlFor="prepTimeMinutes" error={fe?.prepTimeMinutes}>
            <Input id="prepTimeMinutes" name="prepTimeMinutes" type="number" min={1} max={120} defaultValue={item?.prepTimeMinutes ?? 10} required />
          </Field>
          <Field label="Category" htmlFor="categoryId" error={fe?.categoryId}>
            <Select id="categoryId" name="categoryId" defaultValue={item?.categoryId ?? categories[0]?.id} required>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Checkbox name="isVeg" label="Vegetarian" defaultChecked={item?.isVeg ?? true} />
          <Checkbox name="isAvailable" label="Available now" defaultChecked={item?.isAvailable ?? true} />
          <Checkbox name="isPopular" label="Mark popular" defaultChecked={item?.isPopular ?? false} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => ref.current?.close()}>Cancel</Button>
          <SubmitButton pendingText="Saving…">Save item</SubmitButton>
        </div>
      </form>
    </dialog>
  )
}

function CategoryManager({ categories }: { categories: Category[] }) {
  const router = useRouter()
  const [state, action] = useActionState<ActionResult | undefined, FormData>(saveCategoryAction, undefined)
  const [editingId, setEditingId] = useState<string | null>(null)
  useEffect(() => {
    if (state?.ok) {
      setEditingId(null)
      router.refresh()
    }
  }, [state, router])

  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><Tags className="h-5 w-5 text-accent" /> Categories</span>}
        description="Hidden categories disappear from the user menu."
        action={<Button variant="secondary" size="sm" onClick={() => setEditingId('new')}><Plus className="h-4 w-4" /> Add category</Button>}
      />
      <CardBody className="pt-4">
        {state && !state.ok && <Notice tone="danger" className="mb-4">{state.error}</Notice>}
        <ul className="divide-y divide-line">
          {[...categories, ...(editingId === 'new' ? [{ id: 'new', name: '', description: '', sortOrder: categories.length + 1, isActive: true, itemCount: 0 }] : [])].map((c) =>
            editingId === c.id ? (
              <li key={c.id} className="py-3">
                <form action={action} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_90px_auto_auto]">
                  {c.id !== 'new' && <input type="hidden" name="id" value={c.id} />}
                  <Field label="Name" htmlFor={`n-${c.id}`}><Input id={`n-${c.id}`} name="name" defaultValue={c.name} required /></Field>
                  <Field label="Description" htmlFor={`d-${c.id}`}><Input id={`d-${c.id}`} name="description" defaultValue={c.description ?? ''} /></Field>
                  <Field label="Order" htmlFor={`o-${c.id}`}><Input id={`o-${c.id}`} name="sortOrder" type="number" min={0} defaultValue={c.sortOrder} /></Field>
                  <Checkbox name="isActive" label="Visible" defaultChecked={c.isActive} className="pb-3" />
                  <div className="flex gap-2">
                    <SubmitButton size="md">Save</SubmitButton>
                    <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <span className="font-semibold">{c.name}</span>
                  <span className="ml-2 text-sm text-muted">{c.itemCount} items</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={c.isActive ? 'success' : 'neutral'}>{c.isActive ? 'Visible' : 'Hidden'}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => setEditingId(c.id)} aria-label={`Edit ${c.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      </CardBody>
    </Card>
  )
}
