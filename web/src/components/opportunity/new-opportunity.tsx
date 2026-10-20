'use client';

import { useState } from 'react';
import { useCreateOpportunity } from '@/lib/queries';
import { useCurrentSeller } from '../providers';
import { Modal } from '../ui/modal';
import { Button } from '../ui/primitives';
import { useToast } from '../ui/toast';
import { OpportunityForm } from './opportunity-form';

export function NewOpportunityButton({ onCreated }: { onCreated: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const create = useCreateOpportunity();
  const { sellerId } = useCurrentSeller();
  const toast = useToast();

  return (
    <>
      <Button
        variant="primary"
        onClick={() => {
          create.reset();
          setOpen(true);
        }}
      >
        + Nova oportunidade
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nova oportunidade">
        {open && (
          <OpportunityForm
            defaultSellerId={sellerId}
            submitLabel="Criar oportunidade"
            isSubmitting={create.isPending}
            error={create.error}
            onCancel={() => setOpen(false)}
            onSubmit={(input) =>
              create.mutate(input, {
                onSuccess: (created) => {
                  setOpen(false);
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
    </>
  );
}
