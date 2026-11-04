import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Creneau, PlanningDetailDto } from '@rni/shared';
import { AuthService } from '../../core/auth/auth.service';
import { AsyncView } from '../../shared/ui/async-view';
import { MonthNav } from '../../shared/ui/month-nav';
import { PositionFilter } from '../../shared/ui/position-filter';
import { RegionSelect } from '../../shared/ui/region-select';
import { Segmented, SegmentOption } from '../../shared/ui/segmented';
import { PlanningFormInit, PlanningSlotDialog } from '../planning/components/planning-slot-dialog';
import { DayList } from './components/day-list';
import { MonthCalendar } from './components/month-calendar';
import { PlanningMobileStore } from './planning-mobile.store';

/** Planning mobile (§5.4). */
@Component({
  selector: 'rni-planning-mobile-page',
  imports: [DatePipe, MonthNav, RegionSelect, Segmented, PositionFilter, AsyncView, MonthCalendar, DayList, PlanningSlotDialog],
  providers: [PlanningMobileStore],
  template: `
    <div class="mx-auto flex w-full max-w-xl flex-col gap-3 p-3">
      <rni-month-nav class="card justify-between p-2" [showToday]="false" [value]="store.month()" (valueChange)="store.setMonth($event)" />

      <div class="card space-y-2 p-3">
        <div class="flex gap-2">
          <rni-region-select class="flex-1" [nullLabel]="national() ? 'National' : 'Toutes mes régions'" [value]="store.region()" (valueChange)="store.setRegion($event)" />
          <rni-segmented label="Créneau" [options]="creneaux" [value]="store.creneau()" (valueChange)="store.creneau.set($event)" />
        </div>
        <rni-position-filter [value]="store.positions()" (valueChange)="store.positions.set($event)" />
      </div>

      <rni-async-view class="card p-2" [loading]="store.counts.loading()" [pending]="store.counts.pending()" [error]="store.counts.error()" (retry)="store.loadCounts()">
        <rni-month-calendar [days]="store.calendar()" [padding]="store.padding()" [selected]="store.selectedDate()" [today]="store.today" (pick)="store.selectDay($event)" />
      </rni-async-view>

      <div class="card">
        <div class="flex items-center justify-between border-b border-slate-200 p-3">
          <h2 class="text-sm font-semibold">{{ selectedDate() | date: 'EEEE d MMMM' }} — {{ store.creneau() === 1 ? 'Jour (08h-18h)' : 'Nuit (18h-08h)' }}</h2>
          @if (auth.canWritePlanning()) {
            <button type="button" class="btn-primary px-2 py-1 text-xs" (click)="form.set({ date: store.selectedDate(), creneau: store.creneau() })">+ Créneau</button>
          }
        </div>
        <rni-async-view [loading]="store.day.loading()" [pending]="store.day.pending()" [error]="store.day.error()" (retry)="store.loadDay()">
          <rni-day-list [items]="store.dayList()" [canEdit]="canEdit" (select)="open($event)" />
        </rni-async-view>
      </div>
    </div>

    @if (form(); as f) {
      <rni-planning-slot-dialog [init]="f" (closed)="form.set(null)" (saved)="onSaved()" />
    }
  `,
})
export class PlanningMobilePage {
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(PlanningMobileStore);
  protected readonly form = signal<PlanningFormInit | null>(null);
  protected readonly creneaux: SegmentOption<Creneau>[] = [
    { value: Creneau.JOUR, label: 'Jour' },
    { value: Creneau.NUIT, label: 'Nuit' },
  ];
  protected readonly national = computed(() => this.auth.user()?.regions_visibles == null);
  protected readonly selectedDate = computed(() => new Date(`${this.store.selectedDate()}T12:00:00`));
  protected readonly canEdit = (p: PlanningDetailDto) => this.auth.canEditPlanningOf(p);

  constructor() {
    this.store.loadAll();
  }

  open(p: PlanningDetailDto): void {
    this.form.set({ planning: p, user: { nigend: p.nigend, label: `${p.nigend} — ${p.prenom} ${p.nom}` } });
  }

  onSaved(): void {
    this.form.set(null);
    this.store.loadAll();
  }
}
