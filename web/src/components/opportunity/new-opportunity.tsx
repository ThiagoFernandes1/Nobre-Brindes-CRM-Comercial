'use client';

import { useCreateOpportunity } from '@/lib/queries';
import { useCurrentSeller } from '../providers';
import { Modal } from '../ui/modal';
import { useToast } from '../ui/toast';
import { OpportunityForm } from './opportunity-form';

export function NewOpportunityModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const create = useCreateOpportunity();
  const { sellerId } = useCurrentSeller();
  const toast = useToast();

  return (
    <Modal open={open} onClose={onClose} title="Nova oportunidade">
      {open && (
        <OpportunityForm
          defaultSellerId={sellerId}
          submitLabel="Criar oportunidade"
          isSubmitting={create.isPending}
          error={create.error}
          onCancel={onClose}
          onSubmit={(input) =>
            create.mutate(input, {
              onSuccess: (created) => {
                onClose();
                toast({
                  tone: 'success',
                  title: `${created.code} criada em Primeiro Contato`,
                  description: 'O primeiro contato já entrou na agenda de retornos.',
                });
                onCreated(created.id);
              },
            })
          }
        />
      )}
    </Modal>
  );
}
