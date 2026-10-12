import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronLeft, Menu, Save, Shield } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router'
import { comGateNovoOuEdicao } from 'src/components/gate-novo-edicao'
import { Button } from 'src/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from 'src/components/ui/card'
import { Checkbox } from 'src/components/ui/checkbox'
import { Input } from 'src/components/ui/input'
import { Label } from 'src/components/ui/label'
import { Switch } from 'src/components/ui/switch'
import { useHeaderConfig } from 'src/hooks/use-header-config'
import { rotasIncompletas } from 'src/lib/permissao-da-rota'
import { toast } from 'src/lib/toast'
import { cn } from 'src/lib/utils'
import { usePermissoesListAll } from 'src/services/permissoes'
import { useRoles, useRolesCreate, useRolesUpdate } from 'src/services/roles'
import { z } from 'zod'

// =========================
// SCHEMA ZOD
// =========================
const roleFormSchema = z.object({
	name: z
		.string()
		.min(1, 'Nome do perfil é obrigatório')
		.min(3, 'Nome deve ter no mínimo 3 caracteres')
		.max(100, 'Nome não pode ter mais de 100 caracteres'),
	active: z.boolean().default(true),
	permissionIds: z.array(z.string()).min(1, 'Selecione ao menos uma permissão'),
})

// A união, porque a rota `/:id` também serve `/novo`; quem separa criar de
// editar é o `comGateNovoOuEdicao` no `export default`.
export const permissao = ['roles:create', 'roles:update']

const RoleDetailsPage = () => {
	const { id } = useParams()
	const navigate = useNavigate()
	const isEditing = id !== 'novo'

	useHeaderConfig({
		breadcrumbs: [
			{ label: 'Segurança', href: '/' },
			{ label: 'Roles', href: '/seguranca/roles' },
			{ label: isEditing ? 'Editar Role' : 'Nova Role' },
		],
		showSearch: false,
	})

	// Setup React Hook Form
	const {
		register,
		control,
		handleSubmit,
		formState: { errors, isSubmitting },
		watch,
		setValue,
		reset,
	} = useForm({
		resolver: zodResolver(roleFormSchema),
		defaultValues: {
			name: '',
			active: true,
			permissionIds: [],
		},
	})

	const selectedPermissions = watch('permissionIds')

	// Buscar dados da role (se estiver editando)
	// Com a flag: sem ela o `GET /:id` esconde a role desligada e o Editar
	// responderia 404.
	const { data: roleData, isLoading: isLoadingRole } = useRoles(id, {
		enabled: isEditing,
		filters: { incluir_inativas: true },
	})

	// Buscar todas as permissões
	const { data: permissoesData, isLoading: isLoadingPermissoes } =
		usePermissoesListAll()

	// Mutations
	const createMutation = useRolesCreate()
	const updateMutation = useRolesUpdate({
		filters: { incluir_inativas: true },
	})

	// Preencher formulário ao carregar a role
	useEffect(() => {
		if (roleData) {
			reset({
				name: roleData.name || '',
				active: roleData.active ?? true,
				permissionIds:
					roleData.rolePermissions?.map((rp) => rp.permission.id) || [],
			})
		}
	}, [roleData, reset])

	// Agrupar permissões por módulo
	const permissionsByModule = useMemo(() => {
		if (!permissoesData?.data) return {}

		const grouped = {}

		permissoesData.data.forEach((permission) => {
			// Extrair módulo do identifier (ex: "usuarios:create" -> "usuarios")
			const [module] = permission.identifier.split(':')

			if (!grouped[module]) {
				grouped[module] = {
					name: module,
					displayName: getModuleDisplayName(module),
					icon: getModuleIcon(module),
					color: getModuleColor(module),
					permissions: [],
				}
			}

			grouped[module].permissions.push(permission)
		})

		return grouped
	}, [permissoesData])

	// Verificar se todos estão selecionados
	const allPermissionsSelected = useMemo(() => {
		if (!permissoesData?.data) return false
		return permissoesData.data.every((p) => selectedPermissions.includes(p.id))
	}, [selectedPermissions, permissoesData])

	// Verificar se algum está selecionado (para estado indeterminado)
	const somePermissionsSelected = useMemo(() => {
		return selectedPermissions.length > 0 && !allPermissionsSelected
	}, [selectedPermissions, allPermissionsSelected])

	// Toggle master (selecionar tudo)
	const handleToggleMaster = () => {
		if (allPermissionsSelected) {
			setValue('permissionIds', [])
		} else {
			const allIds = permissoesData.data.map((p) => p.id)
			setValue('permissionIds', allIds)
		}
	}

	// Toggle de um módulo inteiro
	const handleToggleModule = (moduleName) => {
		const modulePermissions = permissionsByModule[moduleName].permissions
		const moduleIds = modulePermissions.map((p) => p.id)

		// Verifica se todos do módulo estão selecionados
		const allModuleSelected = moduleIds.every((id) =>
			selectedPermissions.includes(id),
		)

		const newSelected = [...selectedPermissions]

		if (allModuleSelected) {
			// Remover todos do módulo
			moduleIds.forEach((id) => {
				const idx = newSelected.indexOf(id)
				if (idx > -1) newSelected.splice(idx, 1)
			})
		} else {
			// Adicionar todos do módulo
			moduleIds.forEach((id) => {
				if (!newSelected.includes(id)) newSelected.push(id)
			})
		}

		setValue('permissionIds', newSelected)
	}

	// Toggle de uma permissão específica
	const handleTogglePermission = (permissionId) => {
		const newSelected = [...selectedPermissions]

		const idx = newSelected.indexOf(permissionId)
		if (idx > -1) {
			newSelected.splice(idx, 1)
			setValue('permissionIds', newSelected)
			return
		}

		newSelected.push(permissionId)
		const adicionadas = completarDependencias(newSelected)
		setValue('permissionIds', newSelected)
		if (adicionadas.length) {
			toast.info(`Adicionadas junto, a tela exige: ${adicionadas.join(', ')}`)
		}
	}

	const identifierPorId = useMemo(
		() =>
			new Map((permissoesData?.data ?? []).map((p) => [p.id, p.identifier])),
		[permissoesData],
	)
	const idPorIdentifier = useMemo(
		() =>
			new Map((permissoesData?.data ?? []).map((p) => [p.identifier, p.id])),
		[permissoesData],
	)

	// Muta `ids`; devolve os identifiers que entraram.
	const completarDependencias = (ids) => {
		const identifiers = ids.map((i) => identifierPorId.get(i)).filter(Boolean)
		const faltam = [
			...new Set(rotasIncompletas(identifiers).flatMap((r) => r.faltam)),
		].filter((f) => idPorIdentifier.has(f))
		for (const f of faltam) ids.push(idPorIdentifier.get(f))
		return faltam
	}

	const incompletas = useMemo(
		() =>
			rotasIncompletas(
				selectedPermissions.map((i) => identifierPorId.get(i)).filter(Boolean),
			),
		[selectedPermissions, identifierPorId],
	)

	const handleCompletar = () => {
		const ids = [...selectedPermissions]
		completarDependencias(ids)
		setValue('permissionIds', ids)
	}

	// Verificar se um módulo está completamente selecionado
	const isModuleFullySelected = (moduleName) => {
		const modulePermissions = permissionsByModule[moduleName]?.permissions || []
		return modulePermissions.every((p) => selectedPermissions.includes(p.id))
	}

	// Verificar se um módulo está parcialmente selecionado
	const isModulePartiallySelected = (moduleName) => {
		const modulePermissions = permissionsByModule[moduleName]?.permissions || []
		const someSelected = modulePermissions.some((p) =>
			selectedPermissions.includes(p.id),
		)
		const allSelected = modulePermissions.every((p) =>
			selectedPermissions.includes(p.id),
		)
		return someSelected && !allSelected
	}

	// Submeter formulário
	const onSubmit = async (data) => {
		try {
			if (isEditing) {
				await updateMutation.mutateAsync({ id, data })
				toast.success('Perfil atualizado com sucesso!')
				navigate('/seguranca/roles')
			} else {
				await createMutation.mutateAsync(data)
				toast.success('Perfil criado com sucesso!')
				navigate('/seguranca/roles')
			}
		} catch (error) {
			toast.error(error.response?.data?.error || 'Erro ao salvar perfil')
		}
	}

	const isLoading = isLoadingRole || isLoadingPermissoes

	if (isLoading) {
		return (
			<div className='flex items-center justify-center h-96'>
				<div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary'></div>
			</div>
		)
	}

	return (
		<div className='min-h-screen gap-4 p-4 py-8'>
			<div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
				{/* Breadcrumb/Voltar */}
				<Button
					variant='ghost'
					className='mb-6 -ml-2'
					onClick={() => navigate('/seguranca/roles')}
				>
					<ChevronLeft className='h-4 w-4 mr-2' />
					Voltar para Roles
				</Button>

				<form onSubmit={handleSubmit(onSubmit)} className='space-y-6'>
					<Card>
						<CardHeader>
							<CardTitle className='flex items-center gap-2'>
								<Menu className='h-5 w-5 text-primary' />
								{isEditing ? 'Alterar perfil' : 'Criar novo perfil'}
							</CardTitle>
							<CardDescription>
								Informações principais do perfil
							</CardDescription>
						</CardHeader>
						<CardContent className='space-y-6'>
							{/* Nome do Perfil */}
							<div className='space-y-2'>
								<Label htmlFor='name'>Nome do Perfil *</Label>
								<Input
									id='name'
									{...register('name')}
									placeholder='Ex: Administrador, Gerente, Editor...'
									className={cn(
										errors.name &&
											'border-destructive focus-visible:ring-destructive',
									)}
								/>
								{errors.name && (
									<p className='text-xs text-destructive mt-1'>
										{errors.name.message}
									</p>
								)}
								{!errors.name && (
									<p className='text-xs text-muted-foreground'>
										Digite um nome único para identificar este perfil
									</p>
								)}
							</div>

							{/* Status Toggle */}
							<div className='flex items-center justify-between p-3 bg-muted/30 rounded-lg border'>
								<div className='flex-1'>
									<Label
										htmlFor='active-toggle'
										className='text-base font-medium'
									>
										Status
									</Label>
									<p className='text-sm text-muted-foreground mt-1'>
										{watch('active')
											? '✓ Perfil ativo e disponível'
											: '⊘ Perfil inativo'}
									</p>
								</div>
								<Controller
									name='active'
									control={control}
									render={({ field }) => (
										<Switch
											id='active-toggle'
											checked={field.value}
											onCheckedChange={field.onChange}
											className='ml-4'
										/>
									)}
								/>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className='flex items-center gap-2'>
								<Shield className='h-5 w-5 text-primary' />
								Cadastrar permissões
							</CardTitle>
							<CardDescription>
								Selecione as funcionalidades que os usuários com este perfil
								poderão acessar no sistema
							</CardDescription>
						</CardHeader>
						<CardContent className='space-y-6'>
							{/* Toggle Master */}
							<div className='flex items-center space-x-3 p-3 bg-primary/5 rounded-lg border border-primary/20'>
								<Checkbox
									id='select-all'
									checked={allPermissionsSelected}
									onCheckedChange={handleToggleMaster}
									className={cn(
										somePermissionsSelected &&
											'data-[state=checked]:bg-primary/50',
									)}
								/>
								<label
									htmlFor='select-all'
									className='text-sm font-medium cursor-pointer flex-1'
								>
									{allPermissionsSelected
										? '✓ Todas as permissões selecionadas'
										: 'Selecionar todas as permissões'}
								</label>
							</div>

							{/* Grid de Módulos */}
							<div>
								<h3 className='text-sm font-semibold mb-4 text-muted-foreground'>
									Módulos de Acesso
								</h3>
								<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
									{Object.entries(permissionsByModule).map(
										([moduleName, module]) => (
											<ModuleCard
												key={moduleName}
												module={module}
												selectedPermissions={selectedPermissions}
												onToggleModule={() => handleToggleModule(moduleName)}
												onTogglePermission={handleTogglePermission}
												isFullySelected={isModuleFullySelected(moduleName)}
												isPartiallySelected={isModulePartiallySelected(
													moduleName,
												)}
											/>
										),
									)}
								</div>
							</div>

							{/* Erro de validação */}
							{errors.permissionIds && (
								<div className='p-3 bg-destructive/10 border border-destructive/30 rounded-lg'>
									<p className='text-sm text-destructive font-medium'>
										{errors.permissionIds.message}
									</p>
								</div>
							)}

							{incompletas.length > 0 && (
								<div className='p-3 bg-amber-50 border border-amber-300 rounded-lg space-y-2 dark:bg-amber-950/30'>
									<p className='text-sm font-medium'>
										Telas que este perfil não vai conseguir abrir — falta
										permissão que elas exigem junto:
									</p>
									<ul className='text-sm text-muted-foreground list-disc pl-5'>
										{incompletas.map((r) => (
											<li key={r.url}>
												<code>{r.url}</code> — falta {r.faltam.join(', ')}
											</li>
										))}
									</ul>
									<Button
										type='button'
										size='sm'
										variant='outline'
										onClick={handleCompletar}
									>
										Adicionar as que faltam
									</Button>
								</div>
							)}

							{/* Resumo de permissões selecionadas */}
							{selectedPermissions.length > 0 && (
								<div className='p-3 bg-muted/50 rounded-lg border'>
									<p className='text-sm text-muted-foreground'>
										<strong>{selectedPermissions.length}</strong> permissão
										{selectedPermissions.length !== 1 ? 'ões' : ''} selecionada
										{selectedPermissions.length !== 1 ? 's' : ''}
									</p>
								</div>
							)}
						</CardContent>
					</Card>

					<div className='flex gap-3 pt-4'>
						<Button
							type='button'
							variant='outline'
							onClick={() => navigate('/seguranca/roles')}
							className='w-full sm:w-auto'
						>
							Cancelar
						</Button>
						<Button
							type='submit'
							disabled={isSubmitting}
							className='w-full sm:w-auto'
						>
							<Save className='h-4 w-4 mr-2' />
							{isSubmitting ? 'Salvando...' : 'Salvar Perfil'}
						</Button>
					</div>
				</form>
			</div>
		</div>
	)
}

const ModuleCard = ({
	module,
	selectedPermissions,
	onToggleModule,
	onTogglePermission,
	isFullySelected,
	isPartiallySelected,
}) => {
	return (
		<Card className='hover:shadow-md transition-shadow'>
			<CardHeader className='pb-3'>
				<div className='flex items-center justify-between'>
					<div className='flex items-center gap-3'>
						{/* Ícone do Módulo */}
						<div
							className={cn(
								'h-10 w-10 rounded-lg flex items-center justify-center text-xl',
								module.color,
							)}
						>
							{module.icon}
						</div>
						{/* Nome do Módulo */}
						<h3 className='font-semibold text-sm'>{module.displayName}</h3>
					</div>
					{/* Checkbox de Grupo */}
					<Checkbox
						checked={isFullySelected}
						onCheckedChange={onToggleModule}
						className={cn(
							isPartiallySelected && 'data-[state=checked]:bg-primary/50',
						)}
					/>
				</div>
			</CardHeader>
			<CardContent className='space-y-2'>
				{module.permissions.map((permission) => (
					<div
						key={permission.id}
						className='flex items-center space-x-2 group'
					>
						<Checkbox
							id={permission.id}
							checked={selectedPermissions.includes(permission.id)}
							onCheckedChange={() => onTogglePermission(permission.id)}
							className='rounded-full'
						/>
						<label
							htmlFor={permission.id}
							className='text-sm cursor-pointer flex-1 group-hover:text-primary transition-colors'
						>
							{formatPermissionName(permission.name)}
						</label>
					</div>
				))}
			</CardContent>
		</Card>
	)
}

// =========================
// HELPERS
// =========================

/**
 * Retorna o nome de exibição do módulo
 */
function getModuleDisplayName(module) {
	const names = {
		usuarios: 'Usuários',
		roles: 'Perfis',
		permissoes: 'Permissões',
		funcionalidades: 'Funcionalidades',
		// Adicione mais conforme necessário
	}
	return names[module] || module.charAt(0).toUpperCase() + module.slice(1)
}

/**
 * Retorna o ícone do módulo
 */
function getModuleIcon(module) {
	const icons = {
		usuarios: '👤',
		roles: '🔐',
		permissoes: '✓',
		funcionalidades: '⚙️',
	}
	return icons[module] || '📦'
}

/**
 * Retorna a cor de fundo do ícone do módulo
 */
function getModuleColor(module) {
	const colors = {
		usuarios: 'bg-orange-100 text-orange-600',
		roles: 'bg-purple-100 text-purple-600',
		permissoes: 'bg-green-100 text-green-600',
		funcionalidades: 'bg-blue-100 text-blue-600',
	}
	return colors[module] || 'bg-gray-100 text-gray-600'
}

/**
 * Formata o nome da permissão para exibição
 */
function formatPermissionName(name) {
	// Remove o prefixo do módulo se existir (ex: "Usuários - Criar" -> "Criar")
	const parts = name.split(' - ')
	return parts.length > 1 ? parts[1] : name
}

// `permissions:read` nas duas: a tela monta a lista de permissões do perfil
// por `GET /seguranca/permissoes/all`, e sem ela o formulário vinha vazio.
export default comGateNovoOuEdicao(RoleDetailsPage, {
	criar: ['roles:create', 'permissions:read'],
	editar: ['roles:read', 'roles:update', 'permissions:read'],
})
